import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { useHabits } from './hooks/useHabits';
import { useTasks } from './hooks/useTasks';
import { useTimeLogs } from './hooks/useTimeLogs';
import { useTimer } from './hooks/useTimer';
import { useGoogleCalendar, gcalBannerDismissed, dismissGcalBanner } from './hooks/useGoogleCalendar';
import { useDriveSync } from './hooks/useDriveSync';
import LeftSidebar from './components/LeftSidebar';
import GoogleCalendarBanner from './components/GoogleCalendarBanner';
import StackedBarChart from './components/StackedBarChart';
import HabitProgressChart from './components/HabitProgressChart';
import HabitDiary from './components/HabitDiary';
import ToDoList from './components/ToDoList';
import FocusTimer from './components/FocusTimer';
import CompletedTasksLog from './components/CompletedTasksLog';
import TaskCalendar from './components/TaskCalendar';
import HabitStatsView from './components/HabitStatsView';
import SessionEditModal from './components/SessionEditModal';
import type { SessionItemOption } from './components/SessionEditModal';
import type { StackedBarDatum, FocusSession } from './types';
import { ITEM_COLORS } from './types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pending GCal events — queued when creation fails, retried on next successful connect */
type PendingGcalHabit = { type: 'habit'; dateStr: string; habitId: string; habitName: string; color: string | null };
type PendingGcalSess  = { type: 'session'; session: FocusSession; itemName: string; itemColor: string | null };
type PendingGcalEvent = PendingGcalHabit | PendingGcalSess;

/** Resolve an itemId → display name, including sub-habits with "Parent › Sub" format. */
function resolveItemName(
  itemId: string,
  habitList: { id: string; name: string; subHabits?: { id: string; name: string; emoji?: string }[] }[],
  taskList: { id: string; title: string }[],
): string {
  const habit = habitList.find(h => h.id === itemId);
  if (habit) return habit.name;
  for (const h of habitList) {
    const sh = h.subHabits?.find(s => s.id === itemId);
    if (sh) return `${h.name} › ${sh.emoji ? sh.emoji + ' ' : ''}${sh.name}`;
  }
  return taskList.find(t => t.id === itemId)?.title ?? 'Focus Session';
}

/** Returns YYYY-MM-DD in the user's local timezone (not UTC). */
function localDateStr(d: Date = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function App() {
  const habits = useHabits();
  const tasks = useTasks();
  const timeLogs = useTimeLogs();
  const gcal = useGoogleCalendar();
  const pendingGcalRef = useRef<PendingGcalEvent[]>([]);
  // flushPendingRef is updated every render so it always closes over fresh state
  const flushPendingRef = useRef<() => void>(() => {});

  const handleSyncPull = useCallback(() => {
    window.dispatchEvent(new CustomEvent('hd-sync-loaded'));
    // Give localStorage a moment to settle, then flush pending events + pick up
    // any sessions that arrived via Drive from another device.
    setTimeout(() => flushPendingRef.current(), 1500);
  }, []);
  // When Drive gets a 401: the access token expired. Silently refresh it in the
  // background. We NEVER disconnect on failure — a transient refresh failure must
  // not drop the user's Google link (they'd otherwise have to reconnect manually).
  // The periodic refresh + the next user interaction will recover the token.
  const handleTokenExpired = useCallback(() => {
    gcal.autoConnect().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const driveSync = useDriveSync({
    getToken: gcal.getToken,
    onPullComplete: handleSyncPull,
    onTokenExpired: handleTokenExpired,
  });
  const [activeNav, setActiveNav] = useState('home');

  // GCal banner: show unless dismissed, hidden once connected
  const [showGcalBanner, setShowGcalBanner] = useState(
    () => !gcalBannerDismissed(),
  );

  function handleGcalBannerConnect(): Promise<void> {
    return gcal.connect();
  }

  /** バナーを再表示（FocusTimer の「Google で連携する」ボタンから、ClientID 未登録の場合） */
  function handleGcalShowBanner() {
    localStorage.removeItem('hd_gcal_banner_dismissed');
    setShowGcalBanner(true);
  }

  /** FocusTimer の「Google で連携する」ボタン — ClientID 設定済みならそのまま接続、未設定ならバナー表示 */
  function handleTimerGcalConnect(): Promise<void> {
    if (!gcal.clientId) {
      handleGcalShowBanner();
      return Promise.resolve();
    }
    return gcal.connect();
  }

  function handleGcalBannerDismiss() {
    dismissGcalBanner();
    setShowGcalBanner(false);
  }

  // FocusTimer から「別のアカウントで変更」ボタン押下時
  function handleGcalSwitchAccount() {
    gcal.disconnect();
    localStorage.removeItem('hd_gcal_banner_dismissed');
    setShowGcalBanner(true);
  }

  // Show/hide banner based on connection state
  useEffect(() => {
    if (gcal.connected && !gcal.needsReauth) {
      setShowGcalBanner(false);
    } else if (!gcalBannerDismissed()) {
      // Token expired / disconnected → show reconnect banner
      setShowGcalBanner(true);
    }
  }, [gcal.connected, gcal.needsReauth]);

  // Silent token refresh failed → force the reconnect banner even if the user
  // previously dismissed it. Without a fresh token, focus sessions can't reach
  // Google Calendar, so this is important enough to re-surface.
  useEffect(() => {
    if (gcal.needsReauth) setShowGcalBanner(true);
  }, [gcal.needsReauth]);

  // Start/stop Drive polling based on connection state
  useEffect(() => {
    if (gcal.connected) {
      // After initial pull settles, push local data to Drive.
      // Handles the case where the user edited habits before connecting GCal.
      driveSync.startPolling().then(() => driveSync.schedulePush());
      // Flush any events that failed while the token was unavailable
      setTimeout(() => flushPendingRef.current(), 500);
    } else {
      driveSync.stopPolling();
    }
  }, [gcal.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push to Drive when any data changes (debounced 3s)
  const allDataForSync = useMemo(() => ({
    habits: habits.habits,
    completions: habits.completions,
    subCompletions: habits.subCompletions,
    tasks: tasks.tasks,
    completedTasks: tasks.completedTasks,
    timeLogs: timeLogs.timeLogs,
  }), [habits.habits, habits.completions, habits.subCompletions,
      tasks.tasks, tasks.completedTasks,
      timeLogs.timeLogs]);

  useEffect(() => {
    if (gcal.connected) driveSync.schedulePush();
  }, [allDataForSync]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodically retry any GCal events that failed to sync (e.g. the token was
  // briefly expired when a focus session ended). Once the background refresh has
  // a fresh token, these flush through automatically — the user never has to
  // manually reconnect or refresh the page to get their sessions onto Calendar.
  useEffect(() => {
    const id = setInterval(() => { flushPendingRef.current(); }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // Selected item for the timer (habit or task)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // セッション記録一覧で表示している日付（実時間の訂正はここから行う）
  const [sessionViewDate, setSessionViewDate] = useState(localDateStr());

  // Assign colors: habits → indices 0..n-1, active tasks → n..n+m-1, completed tasks → same slot by ID
  const itemColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    habits.habits.forEach((h, i) => {
      map[h.id] = ITEM_COLORS[i % ITEM_COLORS.length];
      h.subHabits?.forEach(sh => { map[sh.id] = ITEM_COLORS[i % ITEM_COLORS.length]; });
    });
    tasks.tasks.forEach((t, i) => { map[t.id] = ITEM_COLORS[(habits.habits.length + i) % ITEM_COLORS.length]; });
    // Completed tasks: assign colors not already in map (stable by order they appear in completedTasks)
    let colorOffset = habits.habits.length + tasks.tasks.length;
    tasks.completedTasks.forEach(t => {
      if (!map[t.id]) {
        map[t.id] = ITEM_COLORS[colorOffset % ITEM_COLORS.length];
        colorOffset++;
      }
    });
    return map;
  }, [habits.habits, tasks.tasks, tasks.completedTasks]);

  // onComplete: saves time to timeLogs
  // 足す日は「タイマーを止めた日」ではなく「セッションを始めた日」。
  // 訂正・削除も同じ基準で引くので、日をまたいだセッションでも集計がズレない。
  const handleTimerComplete = useCallback((session: FocusSession) => {
    if (session.itemId && session.durationSeconds > 0) {
      timeLogs.addTime(
        localDateStr(new Date(session.startTime)), session.itemId, session.durationSeconds,
      );
    }
    // 過去の日を見ていても、記録した瞬間はその日の一覧に戻す
    setSessionViewDate(localDateStr(new Date(session.startTime)));
  }, [timeLogs]);

  // habitGcalEvents: date:habitId → gcalEventId のマップ（localStorage保存）
  const [habitGcalEvents, setHabitGcalEvents] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('hd_habit_gcal_events') ?? '{}'); } catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem('hd_habit_gcal_events', JSON.stringify(habitGcalEvents));
  }, [habitGcalEvents]);

  // updateSessionGcalId を ref 経由で参照（循環参照を避けるため）
  const updateSessionGcalIdRef = useRef<((sessionId: string, gcalEventId: string) => void) | null>(null);

  // Tracks session IDs that already have an in-flight or completed GCal event.
  // This is the single source of truth that prevents a session from being sent
  // to Google Calendar more than once — no matter which path triggers the sync
  // (timer stop, pending-queue flush, or the "unsynced today sessions" scan).
  const gcalSessionSync = useRef<Set<string>>(new Set());

  // Unified session → Google Calendar sync with built-in de-duplication.
  // onSessionSaved (timer stop) and the flush logic all route through this.
  const handleSessionSaved = useCallback((session: FocusSession) => {
    if (!session.itemId) return;
    if (session.gcalEventId) return;                      // already has an event
    if (gcalSessionSync.current.has(session.id)) return;  // in-flight or done
    if (localStorage.getItem('hd_gcal_ever_connected') !== '1') return;
    // Claim this session synchronously so a concurrent flush can't double-create.
    gcalSessionSync.current.add(session.id);
    const name  = resolveItemName(session.itemId, habits.habits, [...tasks.tasks, ...tasks.completedTasks]);
    const color = itemColorMap[session.itemId] ?? null;
    gcal.createEvent(session, name, color).then(eventId => {
      if (eventId) {
        updateSessionGcalIdRef.current?.(session.id, eventId);
      } else {
        // Token not ready — release the claim and queue for retry on reconnect
        gcalSessionSync.current.delete(session.id);
        pendingGcalRef.current.push({ type: 'session', session, itemName: name, itemColor: color });
      }
    }).catch(() => {
      gcalSessionSync.current.delete(session.id);
    });
  }, [gcal, habits.habits, tasks.tasks, tasks.completedTasks, itemColorMap]);

  const timer = useTimer({ onComplete: handleTimerComplete, onSessionSaved: handleSessionSaved });

  // timer が定義された後に ref を更新
  updateSessionGcalIdRef.current = timer.updateSessionGcalId;

  // Item name/color for FocusTimer display
  const activeTimerItemId = timer.currentItemId ?? selectedItemId;
  const activeItemName = useMemo(() => {
    if (!activeTimerItemId) return null;
    const habit = habits.habits.find(h => h.id === activeTimerItemId);
    if (habit) return habit.name;
    // Check sub-habits
    for (const h of habits.habits) {
      const sh = h.subHabits?.find(s => s.id === activeTimerItemId);
      if (sh) return `${h.name} › ${sh.emoji ? sh.emoji + ' ' : ''}${sh.name}`;
    }
    const task = tasks.tasks.find(t => t.id === activeTimerItemId);
    if (task) return task.title;
    const done = tasks.completedTasks.find(t => t.id === activeTimerItemId);
    return done?.title ?? null;
  }, [activeTimerItemId, habits.habits, tasks.tasks, tasks.completedTasks]);
  const activeItemColor = activeTimerItemId ? (itemColorMap[activeTimerItemId] ?? null) : null;

  function selectItem(id: string) {
    if (timer.status === 'running') return;
    setSelectedItemId(prev => prev === id ? null : id);
  }

  function handleStart() {
    timer.start(selectedItemId);
  }

  // 習慣チェック → GCal 終日イベント作成/削除
  function handleToggleHabit(habitId: string, date: string) {
    const wasChecked = (habits.completions[date] ?? []).includes(habitId);
    habits.toggleHabit(habitId, date);
    if (localStorage.getItem('hd_gcal_ever_connected') !== '1') return;
    if (!wasChecked) {
      // チェック → 終日イベント作成
      const habit = habits.habits.find(h => h.id === habitId);
      if (!habit) return;
      const color = itemColorMap[habitId] ?? null;
      gcal.createHabitEvent(date, habit.name, color)
        .then(eventId => {
          if (eventId) {
            setHabitGcalEvents(prev => ({ ...prev, [`${date}:${habitId}`]: eventId }));
          } else {
            // Queue for retry on reconnect
            pendingGcalRef.current.push({ type: 'habit', dateStr: date, habitId, habitName: habit.name, color });
          }
        });
    } else {
      // チェック解除 → イベント削除
      const key = `${date}:${habitId}`;
      const eid = habitGcalEvents[key];
      if (eid) {
        gcal.deleteEvent(eid);
        setHabitGcalEvents(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    }
  }

  // ── セッションの実時間の訂正 ──
  // 記録は「セッション一覧（hd_sessions）」と「日別の集計（hd_timelogs）」の二本立てなので、
  // セッションを直したら集計側も同じ分だけ増減させないとグラフの合計がズレる。
  const [sessionEditor, setSessionEditor] = useState<
    { mode: 'add' | 'edit'; session: FocusSession | null } | null
  >(null);

  // 表示中の日付のセッション（開始時刻の昇順）
  const viewSessions = useMemo(() => {
    return timer.sessions
      .filter(s => s?.startTime && localDateStr(new Date(s.startTime)) === sessionViewDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timer.sessions, sessionViewDate]);

  const viewTotalSeconds = viewSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  // 集計側（グラフ・ダイアリーが見ている値）の同じ日の合計。
  // セッションの合計とズレていたら、過去の記録が壊れているサイン。
  const viewLoggedSeconds = Object.values(timeLogs.getTimeForDate(sessionViewDate))
    .reduce((acc, s) => acc + s, 0);

  // 習慣ダイアリーが表示している日のデータ（今日固定だと、日付を戻しても
  // 今日の時間が出てしまう）
  const diaryLogs = timeLogs.getTimeForDate(habits.selectedDate);
  const diarySessions = useMemo(() => {
    return timer.sessions
      .filter(s => s?.startTime && localDateStr(new Date(s.startTime)) === habits.selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timer.sessions, habits.selectedDate]);

  /** その日の集計を、セッション記録の合計で作り直す */
  function handleRecalcDate(date: string) {
    const totals: Record<string, number> = {};
    timer.sessions.forEach(s => {
      if (!s?.startTime || !s.itemId) return;
      if (localDateStr(new Date(s.startTime)) !== date) return;
      totals[s.itemId] = (totals[s.itemId] ?? 0) + s.durationSeconds;
    });
    timeLogs.setTimeForDate(date, totals);
  }

  // 訂正モーダルの項目候補（習慣・サブ習慣・タスク）
  const sessionItemOptions = useMemo<SessionItemOption[]>(() => {
    const opts: SessionItemOption[] = [];
    habits.habits.forEach(h => {
      opts.push({ id: h.id, name: h.name, color: itemColorMap[h.id] ?? '#ccc', group: '習慣' });
      h.subHabits?.forEach(sh => opts.push({
        id: sh.id,
        name: `${h.name} › ${sh.emoji ? sh.emoji + ' ' : ''}${sh.name}`,
        color: itemColorMap[sh.id] ?? '#ccc',
        group: '習慣',
      }));
    });
    tasks.tasks.forEach(t => opts.push({
      id: t.id, name: t.title, color: itemColorMap[t.id] ?? '#ccc', group: 'タスク',
    }));
    tasks.completedTasks.forEach(t => opts.push({
      id: t.id, name: t.title, color: itemColorMap[t.id] ?? '#ccc', group: '完了したタスク',
    }));
    return opts;
  }, [habits.habits, tasks.tasks, tasks.completedTasks, itemColorMap]);

  function handleEditSession(sessionId: string) {
    const session = timer.sessions.find(s => s.id === sessionId);
    if (session) setSessionEditor({ mode: 'edit', session });
  }

  function handleSaveSession(data: {
    itemId: string | null;
    startTime: string;
    endTime: string;
    durationSeconds: number;
    notes: string;
  }) {
    const editing = sessionEditor?.mode === 'edit' ? sessionEditor.session : null;

    // 1. 集計時間の付け替え（元の項目・日付から引いて、新しい方に足す）
    if (editing?.itemId) {
      timeLogs.adjustTime(
        localDateStr(new Date(editing.startTime)), editing.itemId, -editing.durationSeconds,
      );
    }
    if (data.itemId) {
      timeLogs.adjustTime(localDateStr(new Date(data.startTime)), data.itemId, data.durationSeconds);
    }

    // 2. セッション本体を更新／追加
    let saved: FocusSession;
    if (editing) {
      // 訂正後は元の GCal イベントを捨てて作り直す（時間・項目が変わるため）
      if (editing.gcalEventId) gcal.deleteEvent(editing.gcalEventId);
      gcalSessionSync.current.delete(editing.id);
      saved = { ...editing, ...data, edited: true, gcalEventId: undefined };
      timer.updateSession(editing.id, { ...data, edited: true, gcalEventId: undefined });
    } else {
      saved = timer.addManualSession(data);
    }

    // 3. Google カレンダーへ反映
    handleSessionSaved(saved);

    setSessionViewDate(localDateStr(new Date(data.startTime)));
    setSessionEditor(null);
  }

  // フォーカスセッション削除 → 集計時間も戻し、GCal イベントも削除
  function handleDeleteSession(sessionId: string) {
    const session = timer.sessions.find(s => s.id === sessionId);
    if (session) {
      if (session.itemId) {
        timeLogs.adjustTime(
          localDateStr(new Date(session.startTime)), session.itemId, -session.durationSeconds,
        );
      }
      if (session.gcalEventId && gcal.connected) {
        gcal.deleteEvent(session.gcalEventId);
      }
    }
    timer.deleteSession(sessionId);
    setSessionEditor(null);
  }

  // Today's time logs — use local timezone so midnight doesn't flip to yesterday (UTC)
  const today = localDateStr();
  const todayLogs = timeLogs.getTimeForDate(today);

  // Stacked bar chart data (last 7 days)
  const stackedData: StackedBarDatum[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = localDateStr(d);
      const log = timeLogs.timeLogs[key] ?? {};
      const allTasks = [...tasks.tasks, ...tasks.completedTasks];
      const segments = Object.entries(log).map(([itemId, seconds]) => {
        const name = resolveItemName(itemId, habits.habits, allTasks);
        return { itemId, name, color: itemColorMap[itemId] ?? '#ccc', seconds: seconds as number };
      }).filter(s => s.seconds > 0).sort((a, b) => b.seconds - a.seconds);
      return {
        label: DAY_LABELS[d.getDay()],
        segments,
        totalSeconds: segments.reduce((s, seg) => s + seg.seconds, 0),
      };
    });
  }, [timeLogs.timeLogs, habits.habits, tasks.tasks, itemColorMap]);

  // ── 30-day stacked data (Month tab in Time Spent chart) ──
  const monthStackedData: StackedBarDatum[] = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = localDateStr(d);
      const log = timeLogs.timeLogs[key] ?? {};
      const allTasks = [...tasks.tasks, ...tasks.completedTasks];
      const segments = Object.entries(log).map(([itemId, seconds]) => {
        const name = resolveItemName(itemId, habits.habits, allTasks);
        return { itemId, name, color: itemColorMap[itemId] ?? '#ccc', seconds: seconds as number };
      }).filter(s => s.seconds > 0).sort((a, b) => b.seconds - a.seconds);
      const label = i === 0 || d.getDate() === 1
        ? `${d.getMonth()+1}/${d.getDate()}`
        : String(d.getDate());
      return { label, segments, totalSeconds: segments.reduce((s, seg) => s + seg.seconds, 0) };
    });
  }, [timeLogs.timeLogs, habits.habits, tasks.tasks, itemColorMap]);

  // Legend items for stacked chart
  const legendItems = useMemo(() => {
    const seen = new Map<string, { name: string; color: string; total: number }>();
    stackedData.forEach(d => {
      d.segments.forEach(s => {
        const prev = seen.get(s.itemId);
        seen.set(s.itemId, {
          name: s.name,
          color: s.color,
          total: (prev?.total ?? 0) + s.seconds,
        });
      });
    });
    return [...seen.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([itemId, v]) => ({ itemId, name: v.name, color: v.color }));
  }, [stackedData]);

  // Donut chart segments (today's time)
  const donutSegments = useMemo(() => {
    const allTasks = [...tasks.tasks, ...tasks.completedTasks];
    return Object.entries(todayLogs)
      .filter(([, s]) => s > 0)
      .map(([itemId, seconds]) => ({
        itemId,
        name: resolveItemName(itemId, habits.habits, allTasks),
        color: itemColorMap[itemId] ?? '#ccc',
        seconds: seconds as number,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [todayLogs, habits.habits, tasks.tasks, tasks.completedTasks, itemColorMap]);

  const completedCount = (habits.completions[habits.selectedDate] ?? []).length;

  // Map itemId → { name, color } for FocusTimer session list display
  const sessionItemMeta = useMemo(() => {
    const allTasks = [...tasks.tasks, ...tasks.completedTasks];
    const meta: Record<string, { name: string; color: string }> = {};
    viewSessions.forEach(s => {
      if (s.itemId && !meta[s.itemId]) {
        meta[s.itemId] = {
          name: resolveItemName(s.itemId, habits.habits, allTasks),
          color: itemColorMap[s.itemId] ?? '#9a938c',
        };
      }
    });
    return meta;
  }, [viewSessions, habits.habits, tasks.tasks, tasks.completedTasks, itemColorMap]);

  // Update flush function every render so it captures fresh state
  flushPendingRef.current = () => {
    if (!gcal.connected) return;

    // 1. Retry previously failed events
    const queued = pendingGcalRef.current.splice(0);
    queued.forEach(item => {
      if (item.type === 'habit') {
        gcal.createHabitEvent(item.dateStr, item.habitName, item.color).then(eventId => {
          if (eventId) setHabitGcalEvents(prev => ({ ...prev, [`${item.dateStr}:${item.habitId}`]: eventId }));
        });
      } else {
        // Route through the de-duplicating sync so a queued retry can't collide
        // with the scan below or with a direct timer-stop sync.
        handleSessionSaved(item.session);
      }
    });

    // 2. Sync today's sessions that have no GCal event yet (e.g. arrived via Drive sync)
    const todayStr = localDateStr();
    let allSessions: FocusSession[] = [];
    try { allSessions = JSON.parse(localStorage.getItem('hd_sessions') ?? '[]'); } catch { /* */ }
    allSessions
      .filter(s => {
        if (!s.itemId || s.gcalEventId || (s.durationSeconds ?? 0) < 30) return false;
        return localDateStr(new Date(s.startTime)) === todayStr;
      })
      .forEach(s => handleSessionSaved(s));
  };

  return (
    <>
      {/* Google Calendar connection banner — shown on first visit, when disconnected,
          or when the silent token refresh failed and a re-grant is needed. */}
      {showGcalBanner && (!gcal.connected || gcal.needsReauth) && (
        <GoogleCalendarBanner
          hasClientId={!!gcal.clientId}
          needsReauth={gcal.needsReauth}
          isConnecting={gcal.isConnecting}
          lastError={gcal.lastError}
          clientId={gcal.clientId}
          onClientIdChange={gcal.setClientId}
          onConnect={handleGcalBannerConnect}
          onDismiss={handleGcalBannerDismiss}
        />
      )}

    <div className="app-layout">
      <LeftSidebar
        completionRate={habits.completionRate}
        completedCount={completedCount}
        totalCount={habits.habits.length}
        streak={habits.streak}
        donutSegments={donutSegments}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        gcalConnected={gcal.connected}
        onGcalConnect={() => {
          if (!gcal.clientId) {
            handleGcalShowBanner();
          } else {
            gcal.connect();
          }
        }}
      />

      <main className="center-area">
        {activeNav === 'calendar' && (
          <TaskCalendar completedTasks={tasks.completedTasks} />
        )}

        {activeNav === 'completed' && (
          <CompletedTasksLog
            completedTasks={tasks.completedTasks}
            onRemove={tasks.removeCompleted}
            onClearAll={tasks.clearAllCompleted}
          />
        )}

        {activeNav === 'stats' && (
          <HabitStatsView
            habits={habits.habits}
            completions={habits.completions}
            timeLogs={timeLogs.timeLogs}
            colorMap={itemColorMap}
          />
        )}

        {activeNav !== 'calendar' && activeNav !== 'completed' && activeNav !== 'stats' && (
          <>
            <div className="charts-row">
              <StackedBarChart
                weekData={stackedData}
                monthData={monthStackedData}
                legendItems={legendItems}
              />
              <HabitProgressChart
                habits={habits.habits}
                completions={habits.completions}
                colorMap={itemColorMap}
              />
            </div>

            <HabitDiary
              habits={habits.habits}
              completions={habits.completions}
              subCompletions={habits.subCompletions}
              selectedDate={habits.selectedDate}
              timeLogs={diaryLogs}
              sessions={diarySessions}
              activeItemId={timer.status === 'idle' ? selectedItemId : timer.currentItemId}
              timerRunning={timer.status === 'running'}
              colorMap={itemColorMap}
              onToggle={handleToggleHabit}
              onToggleSub={habits.toggleSubHabit}
              onNavigate={habits.navigateDate}
              onSelect={selectItem}
              onAddHabit={habits.addHabit}
              onRemoveHabit={habits.removeHabit}
              onEditHabit={habits.editHabit}
              onAddSubHabit={habits.addSubHabit}
              onRemoveSubHabit={habits.removeSubHabit}
              onEditSubHabit={habits.editSubHabit}
            />

            <ToDoList
              tasks={tasks.tasks}
              pendingCompletions={tasks.pendingCompletions}
              timeLogs={todayLogs}
              sessions={timer.todaySessions}
              activeItemId={timer.status === 'idle' ? selectedItemId : timer.currentItemId}
              timerRunning={timer.status === 'running'}
              colorMap={itemColorMap}
              onToggle={tasks.toggleTask}
              onUndo={tasks.undoTask}
              onStar={tasks.toggleStar}
              onSelect={selectItem}
              onAdd={tasks.addTask}
              onEdit={tasks.editTask}
              onRemove={tasks.removeTask}
            />
          </>
        )}
      </main>

      <FocusTimer
        status={timer.status}
        elapsed={timer.elapsed}
        sessions={viewSessions}
        totalSeconds={viewTotalSeconds}
        loggedSeconds={viewLoggedSeconds}
        viewDate={sessionViewDate}
        onViewDateChange={setSessionViewDate}
        onRecalcDate={handleRecalcDate}
        onEditSession={handleEditSession}
        onAddSession={() => setSessionEditor({ mode: 'add', session: null })}
        pendingNotes={timer.pendingNotes}
        activeItemName={activeItemName}
        activeItemColor={activeItemColor}
        onStart={handleStart}
        onPause={timer.pause}
        onReset={timer.reset}
        onNotesChange={timer.setPendingNotes}
        formatTime={timer.formatTime}
        gcalConnected={gcal.connected}
        gcalNeedsReauth={gcal.needsReauth}
        gcalSyncing={gcal.syncing}
        gcalLastError={gcal.lastError}
        sessionItemMeta={sessionItemMeta}
        gcalMobileSetupUrl={gcal.clientId
          ? `${window.location.origin}${window.location.pathname}#gcal=${encodeURIComponent(gcal.clientId)}`
          : null}
        onGcalConnect={handleTimerGcalConnect}
        onGcalDisconnect={gcal.disconnect}
        onGcalSwitchAccount={handleGcalSwitchAccount}
        onDeleteSession={handleDeleteSession}
      />

      {sessionEditor && (
        <SessionEditModal
          mode={sessionEditor.mode}
          session={sessionEditor.session}
          items={sessionItemOptions}
          defaultDate={sessionViewDate}
          defaultItemId={selectedItemId}
          onSave={handleSaveSession}
          onDelete={sessionEditor.session
            ? () => handleDeleteSession(sessionEditor.session!.id)
            : undefined}
          onClose={() => setSessionEditor(null)}
        />
      )}
    </div>
    </>
  );
}
