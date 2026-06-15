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
    if (gcal.connected) {
      setShowGcalBanner(false);
    } else if (!gcalBannerDismissed()) {
      // Token expired / disconnected → show reconnect banner
      setShowGcalBanner(true);
    }
  }, [gcal.connected]);

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
  const handleTimerComplete = useCallback((itemId: string | null, seconds: number) => {
    if (itemId && seconds > 0) {
      timeLogs.addTime(localDateStr(), itemId, seconds);
    }
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

  // フォーカスセッション削除 → GCal イベントも削除
  function handleDeleteSession(sessionId: string) {
    const session = timer.sessions.find(s => s.id === sessionId);
    if (session?.gcalEventId && gcal.connected) {
      gcal.deleteEvent(session.gcalEventId);
    }
    timer.deleteSession(sessionId);
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
    timer.todaySessions.forEach(s => {
      if (s.itemId && !meta[s.itemId]) {
        meta[s.itemId] = {
          name: resolveItemName(s.itemId, habits.habits, allTasks),
          color: itemColorMap[s.itemId] ?? '#9a938c',
        };
      }
    });
    return meta;
  }, [timer.todaySessions, habits.habits, tasks.tasks, tasks.completedTasks, itemColorMap]);

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
      {/* Google Calendar connection banner — fixed at top, shown on first visit or when disconnected */}
      {showGcalBanner && !gcal.connected && (
        <GoogleCalendarBanner
          hasClientId={!!gcal.clientId}
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
              timeLogs={todayLogs}
              sessions={timer.todaySessions}
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
        todaySessions={timer.todaySessions}
        totalFocusSeconds={timer.totalFocusSeconds}
        pendingNotes={timer.pendingNotes}
        activeItemName={activeItemName}
        activeItemColor={activeItemColor}
        onStart={handleStart}
        onPause={timer.pause}
        onReset={timer.reset}
        onNotesChange={timer.setPendingNotes}
        formatTime={timer.formatTime}
        gcalConnected={gcal.connected}
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
    </div>
    </>
  );
}
