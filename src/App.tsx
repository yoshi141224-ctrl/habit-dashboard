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
import BarChart from './components/BarChart';
import HabitDiary from './components/HabitDiary';
import ToDoList from './components/ToDoList';
import FocusTimer from './components/FocusTimer';
import CompletedTasksLog from './components/CompletedTasksLog';
import TaskCalendar from './components/TaskCalendar';
import HabitStatsView from './components/HabitStatsView';
import type { StackedBarDatum, BarChartDatum } from './types';
import { ITEM_COLORS } from './types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function App() {
  const habits = useHabits();
  const tasks = useTasks();
  const timeLogs = useTimeLogs();
  const gcal = useGoogleCalendar();
  const driveSync = useDriveSync({
    getToken: gcal.getToken,
    onPullComplete: () => window.dispatchEvent(new CustomEvent('hd-sync-loaded')),
  });
  const [activeNav, setActiveNav] = useState('home');

  // GCal banner: show unless dismissed, hidden once connected
  const [showGcalBanner, setShowGcalBanner] = useState(
    () => !gcalBannerDismissed(),
  );

  // On mount: if clientId is stored, try silent auto-connect
  useEffect(() => {
    if (gcal.clientId && !gcal.connected) {
      gcal.autoConnect().then(ok => {
        if (ok) setShowGcalBanner(false); // connected silently → hide banner
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

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

  // Hide banner when connected
  useEffect(() => {
    if (gcal.connected) setShowGcalBanner(false);
  }, [gcal.connected]);

  // Start/stop Drive polling based on connection state
  useEffect(() => {
    if (gcal.connected) {
      driveSync.startPolling();
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
      const today = new Date().toISOString().slice(0, 10);
      timeLogs.addTime(today, itemId, seconds);
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

  // onSessionSaved: sync to Google Calendar when a session is completed
  const handleSessionSaved = useCallback((session: import('./types').FocusSession) => {
    if (!gcal.connected || !session.itemId) return;
    const habit = habits.habits.find(h => h.id === session.itemId);
    const task  = tasks.tasks.find(t => t.id === session.itemId);
    const name  = habit?.name ?? task?.title ?? 'Focus Session';
    const color = itemColorMap[session.itemId] ?? null;
    gcal.createEvent(session, name, color).then(eventId => {
      if (eventId) updateSessionGcalIdRef.current?.(session.id, eventId);
    });
  }, [gcal, habits.habits, tasks.tasks, itemColorMap]);

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
    if (!gcal.connected) return;
    if (!wasChecked) {
      // チェック → 終日イベント作成
      const habit = habits.habits.find(h => h.id === habitId);
      if (!habit) return;
      gcal.createHabitEvent(date, habit.name, itemColorMap[habitId] ?? null)
        .then(eventId => {
          if (eventId) setHabitGcalEvents(prev => ({ ...prev, [`${date}:${habitId}`]: eventId }));
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

  // Today's time logs
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = timeLogs.getTimeForDate(today);

  // Stacked bar chart data (last 7 days)
  const stackedData: StackedBarDatum[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const log = timeLogs.timeLogs[key] ?? {};
      const segments = Object.entries(log).map(([itemId, seconds]) => {
        const habit = habits.habits.find(h => h.id === itemId);
        const task = tasks.tasks.find(t => t.id === itemId);
        const name = habit?.name ?? task?.title ?? itemId;
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
      const key = d.toISOString().slice(0, 10);
      const log = timeLogs.timeLogs[key] ?? {};
      const segments = Object.entries(log).map(([itemId, seconds]) => {
        const habit = habits.habits.find(h => h.id === itemId);
        const task = tasks.tasks.find(t => t.id === itemId);
        const name = habit?.name ?? task?.title ?? itemId;
        return { itemId, name, color: itemColorMap[itemId] ?? '#ccc', seconds: seconds as number };
      }).filter(s => s.seconds > 0).sort((a, b) => b.seconds - a.seconds);
      const label = i === 0 || d.getDate() === 1
        ? `${d.getMonth()+1}/${d.getDate()}`
        : String(d.getDate());
      return { label, segments, totalSeconds: segments.reduce((s, seg) => s + seg.seconds, 0) };
    });
  }, [timeLogs.timeLogs, habits.habits, tasks.tasks, itemColorMap]);

  // ── 30-day habit completion data (Month tab in Habit Progress chart) ──
  const monthHabitData: BarChartDatum[] = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      const done = (habits.completions[key] ?? []).length;
      const total = habits.habits.length;
      const label = i === 0 || d.getDate() === 1
        ? `${d.getMonth()+1}/${d.getDate()}`
        : String(d.getDate());
      return { label, value: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
  }, [habits.completions, habits.habits]);

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
    return Object.entries(todayLogs)
      .filter(([, s]) => s > 0)
      .map(([itemId, seconds]) => {
        const habit = habits.habits.find(h => h.id === itemId);
        const task = tasks.tasks.find(t => t.id === itemId);
        return {
          itemId,
          name: habit?.name ?? task?.title ?? itemId,
          color: itemColorMap[itemId] ?? '#ccc',
          seconds: seconds as number,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
  }, [todayLogs, habits.habits, tasks.tasks, itemColorMap]);

  const completedCount = (habits.completions[habits.selectedDate] ?? []).length;

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
              <BarChart
                title="Habit Progress"
                color="#c49476"
                weekData={habits.weeklyHabitData}
                monthData={monthHabitData}
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
        onGcalConnect={handleTimerGcalConnect}
        onGcalDisconnect={gcal.disconnect}
        onGcalSwitchAccount={handleGcalSwitchAccount}
        onDeleteSession={handleDeleteSession}
      />
    </div>
    </>
  );
}
