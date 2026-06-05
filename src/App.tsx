import { useState, useMemo, useCallback } from 'react';
import './App.css';
import { useHabits } from './hooks/useHabits';
import { useTasks } from './hooks/useTasks';
import { useTimeLogs } from './hooks/useTimeLogs';
import { useTimer } from './hooks/useTimer';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import LeftSidebar from './components/LeftSidebar';
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
  const [activeNav, setActiveNav] = useState('home');

  // Selected item for the timer (habit or task)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Assign colors: habits → indices 0..n-1, active tasks → n..n+m-1, completed tasks → same slot by ID
  const itemColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    habits.habits.forEach((h, i) => { map[h.id] = ITEM_COLORS[i % ITEM_COLORS.length]; });
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

  // onSessionSaved: sync to Google Calendar when a session is completed
  const handleSessionSaved = useCallback((session: import('./types').FocusSession) => {
    if (!gcal.connected || !session.itemId) return;
    const habit = habits.habits.find(h => h.id === session.itemId);
    const task  = tasks.tasks.find(t => t.id === session.itemId);
    const name  = habit?.name ?? task?.title ?? 'Focus Session';
    const color = itemColorMap[session.itemId] ?? null;
    gcal.createEvent(session, name, color);
  }, [gcal, habits.habits, tasks.tasks, itemColorMap]);

  const timer = useTimer({ onComplete: handleTimerComplete, onSessionSaved: handleSessionSaved });

  // Item name/color for FocusTimer display
  const activeTimerItemId = timer.currentItemId ?? selectedItemId;
  const activeItemName = useMemo(() => {
    if (!activeTimerItemId) return null;
    const habit = habits.habits.find(h => h.id === activeTimerItemId);
    if (habit) return habit.name;
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
    <div className="app-layout">
      <LeftSidebar
        completionRate={habits.completionRate}
        completedCount={completedCount}
        totalCount={habits.habits.length}
        donutSegments={donutSegments}
        activeNav={activeNav}
        onNavChange={setActiveNav}
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
              selectedDate={habits.selectedDate}
              timeLogs={todayLogs}
              sessions={timer.todaySessions}
              activeItemId={timer.status === 'idle' ? selectedItemId : timer.currentItemId}
              timerRunning={timer.status === 'running'}
              colorMap={itemColorMap}
              onToggle={habits.toggleHabit}
              onNavigate={habits.navigateDate}
              onSelect={selectItem}
              onAddHabit={habits.addHabit}
              onRemoveHabit={habits.removeHabit}
              onEditHabit={habits.editHabit}
            />

            <ToDoList
              tasks={tasks.tasks}
              timeLogs={todayLogs}
              sessions={timer.todaySessions}
              activeItemId={timer.status === 'idle' ? selectedItemId : timer.currentItemId}
              timerRunning={timer.status === 'running'}
              colorMap={itemColorMap}
              onToggle={tasks.toggleTask}
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
        gcalClientId={gcal.clientId}
        onGcalClientIdChange={gcal.setClientId}
        onGcalConnect={gcal.connect}
        onGcalDisconnect={gcal.disconnect}
      />
    </div>
  );
}
