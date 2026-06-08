import { useState, useEffect } from 'react';
import './MobileView.css';
import type {
  Habit,
  CompletionMap,
  FocusSession,
  Task,
  CompletedTask,
  StackedBarDatum,
  BarChartDatum,
} from '../types';
import HabitDiary from './HabitDiary';
import ToDoList from './ToDoList';
import StackedBarChart from './StackedBarChart';
import BarChart from './BarChart';
import CompletedTasksLog from './CompletedTasksLog';

const MAX_SECONDS = 25 * 60;

interface Props {
  // Habits
  habits: Habit[];
  completions: CompletionMap;
  selectedDate: string;
  completionRate: number;
  todayLogs: Record<string, number>;
  sessions: FocusSession[];
  colorMap: Record<string, string>;
  activeItemId: string | null;
  timerRunning: boolean;
  onToggleHabit: (id: string, date: string) => void;
  onNavigateDate: (delta: -1 | 1) => void;
  onAddHabit: (name: string, detail: string) => void;
  onRemoveHabit: (id: string) => void;
  onEditHabit: (id: string, name: string, detail: string) => void;
  onSelectItem: (id: string) => void;
  // Tasks
  tasks: Task[];
  pendingCompletions: Task[];
  completedTasks: CompletedTask[];
  onToggleTask: (id: string) => void;
  onUndoTask: (id: string) => void;
  onStarTask: (id: string) => void;
  onAddTask: (title: string, tag: string, time: string) => void;
  onRemoveTask: (id: string) => void;
  onRemoveCompleted: (id: string) => void;
  onClearCompleted: () => void;
  // Timer
  timerStatus: 'idle' | 'running' | 'paused';
  timerElapsed: number;
  totalFocusSeconds: number;
  pendingNotes: string;
  activeItemName: string | null;
  activeItemColor: string | null;
  onTimerStart: () => void;
  onTimerPause: () => void;
  onTimerReset: () => void;
  onNotesChange: (v: string) => void;
  formatTime: (s: number) => string;
  // Charts
  stackedData: StackedBarDatum[];
  monthStackedData: StackedBarDatum[];
  legendItems: Array<{ itemId: string; name: string; color: string }>;
  weeklyHabitData: BarChartDatum[];
  monthHabitData: BarChartDatum[];
}

function getCurrentTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function MobileView({
  habits,
  completions,
  selectedDate,
  completionRate,
  todayLogs,
  sessions,
  colorMap,
  activeItemId,
  timerRunning,
  onToggleHabit,
  onNavigateDate,
  onAddHabit,
  onRemoveHabit,
  onEditHabit,
  onSelectItem,
  tasks,
  pendingCompletions,
  completedTasks,
  onToggleTask,
  onUndoTask,
  onStarTask,
  onAddTask,
  onRemoveTask,
  onRemoveCompleted,
  onClearCompleted,
  timerStatus,
  timerElapsed,
  totalFocusSeconds,
  pendingNotes,
  activeItemName,
  activeItemColor,
  onTimerStart,
  onTimerPause,
  onTimerReset,
  onNotesChange,
  formatTime,
  stackedData,
  monthStackedData,
  legendItems,
  weeklyHabitData,
  monthHabitData,
}: Props) {
  const [tab, setTab] = useState<'home' | 'charts' | 'timer' | 'log'>('home');
  const [currentTime, setCurrentTime] = useState(getCurrentTimeString());

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(getCurrentTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // Timer ring geometry
  const r = 55;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(timerElapsed / MAX_SECONDS, 1);
  const strokeOffset = circumference * (1 - progress);

  const ringColor = activeItemColor ?? '#2d2926';

  // Today's sessions (last 3)
  const todaySessions = sessions
    .filter(s => s.startTime.slice(0, 10) === selectedDate)
    .slice(-3)
    .reverse();

  // SVG icons
  const HomeIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );

  const ChartIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );

  const TimerIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );

  const LogIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );

  const tabTitle =
    tab === 'home' ? 'Habits'
    : tab === 'charts' ? 'Charts'
    : tab === 'timer' ? 'Focus'
    : 'Log';

  function formatSessionTime(isoStr: string): string {
    const d = new Date(isoStr);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  function formatDurationShort(seconds: number): string {
    const m = Math.floor(seconds / 60);
    if (m === 0) return '<1m';
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;
  }

  return (
    <div className="mv-outer">
      <div className="mv-phone">
        {/* Top status bar */}
        <div className="mv-topbar">
          <span className="mv-topbar-time">{currentTime}</span>
          <span className="mv-topbar-title">{tabTitle}</span>
          <span style={{ width: 40 }} />
        </div>

        {/* Screen content */}
        <div className="mv-screen">
          <div className="mv-content">
            {tab === 'home' && (
              <>
                {/* Compact score bar */}
                <div className="mv-score-bar">
                  <span className="mv-score-pct">{completionRate}%</span>
                  <div className="mv-score-track">
                    <div className="mv-score-fill" style={{ width: `${completionRate}%` }} />
                  </div>
                  <span className="mv-score-label">
                    {completionRate >= 70 ? 'Great!' : completionRate >= 40 ? 'Keep going!' : 'Just start!'}
                  </span>
                </div>

                <HabitDiary
                  habits={habits}
                  completions={completions}
                  selectedDate={selectedDate}
                  timeLogs={todayLogs}
                  sessions={sessions}
                  activeItemId={activeItemId}
                  timerRunning={timerRunning}
                  colorMap={colorMap}
                  onToggle={onToggleHabit}
                  onNavigate={onNavigateDate}
                  onSelect={onSelectItem}
                  onAddHabit={onAddHabit}
                  onRemoveHabit={onRemoveHabit}
                  onEditHabit={onEditHabit}
                />

                <ToDoList
                  tasks={tasks}
                  pendingCompletions={pendingCompletions}
                  timeLogs={todayLogs}
                  sessions={sessions}
                  activeItemId={activeItemId}
                  timerRunning={timerRunning}
                  colorMap={colorMap}
                  onToggle={onToggleTask}
                  onUndo={onUndoTask}
                  onStar={onStarTask}
                  onSelect={onSelectItem}
                  onAdd={onAddTask}
                  onRemove={onRemoveTask}
                />
              </>
            )}

            {tab === 'charts' && (
              <>
                <StackedBarChart
                  weekData={stackedData}
                  monthData={monthStackedData}
                  legendItems={legendItems}
                />
                <BarChart
                  title="Habit Progress"
                  color="#c49476"
                  weekData={weeklyHabitData}
                  monthData={monthHabitData}
                />
              </>
            )}

            {tab === 'timer' && (
              <div className="mv-timer">
                {/* Active item label */}
                <p className="mv-timer-label">
                  {activeItemName ?? 'No item selected'}
                </p>

                {/* Circular progress ring */}
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle
                    cx="70" cy="70" r={r}
                    fill="none"
                    stroke="#f0ece6"
                    strokeWidth="8"
                  />
                  <circle
                    cx="70" cy="70" r={r}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                  <text
                    x="70" y="70"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="22"
                    fontWeight="700"
                    fill="#2d2926"
                    fontFamily="inherit"
                  >
                    {formatTime(timerElapsed)}
                  </text>
                </svg>

                {/* Total focus today */}
                <p className="mv-timer-total">
                  Total today: <strong>{formatTime(totalFocusSeconds)}</strong>
                </p>

                {/* Buttons */}
                <div className="mv-timer-btns">
                  {timerStatus === 'running' ? (
                    <button type="button" className="mv-timer-btn mv-timer-btn--pause" onClick={onTimerPause}>
                      Pause
                    </button>
                  ) : (
                    <button type="button" className="mv-timer-btn mv-timer-btn--start" onClick={onTimerStart}>
                      {timerStatus === 'paused' ? 'Resume' : 'Start'}
                    </button>
                  )}
                  <button type="button" className="mv-timer-btn mv-timer-btn--reset" onClick={onTimerReset}>
                    Reset
                  </button>
                </div>

                {/* Notes */}
                <textarea
                  className="mv-timer-notes"
                  rows={3}
                  placeholder="Session notes…"
                  value={pendingNotes}
                  onChange={e => onNotesChange(e.target.value)}
                />

                {/* Today's sessions */}
                {todaySessions.length > 0 && (
                  <div className="mv-timer-sessions">
                    <p className="mv-timer-sessions-title">Today's sessions</p>
                    {todaySessions.map(s => {
                      const color = s.itemId ? (colorMap[s.itemId] ?? '#9a938c') : '#9a938c';
                      return (
                        <div key={s.id} className="mv-timer-session-row">
                          <span className="mv-timer-session-dot" style={{ background: color }} />
                          <span className="mv-timer-session-time">
                            {formatSessionTime(s.startTime)} – {formatSessionTime(s.endTime)}
                          </span>
                          <span className="mv-timer-session-dur">
                            {formatDurationShort(s.durationSeconds)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'log' && (
              <CompletedTasksLog
                completedTasks={completedTasks}
                onRemove={onRemoveCompleted}
                onClearAll={onClearCompleted}
              />
            )}
          </div>

          {/* Bottom navigation */}
          <nav className="mv-bottom-nav">
            <button
              type="button"
              className={`mv-nav-btn${tab === 'home' ? ' mv-nav-btn--active' : ''}`}
              onClick={() => setTab('home')}
            >
              {HomeIcon}
              ホーム
            </button>
            <button
              type="button"
              className={`mv-nav-btn${tab === 'charts' ? ' mv-nav-btn--active' : ''}`}
              onClick={() => setTab('charts')}
            >
              {ChartIcon}
              チャート
            </button>
            <button
              type="button"
              className={`mv-nav-btn${tab === 'timer' ? ' mv-nav-btn--active' : ''}`}
              onClick={() => setTab('timer')}
            >
              {TimerIcon}
              タイマー
            </button>
            <button
              type="button"
              className={`mv-nav-btn${tab === 'log' ? ' mv-nav-btn--active' : ''}`}
              onClick={() => setTab('log')}
            >
              {LogIcon}
              ログ
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
