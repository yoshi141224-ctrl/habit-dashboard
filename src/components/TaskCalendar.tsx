import { useState, useMemo } from 'react';
import './TaskCalendar.css';
import type { CompletedTask } from '../types';
import { TAG_COLORS } from '../types';

interface Props {
  completedTasks: CompletedTask[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Use local dates (not UTC) to match the sidebar clock
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function TaskCalendar({ completedTasks }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Group completed tasks by date key (YYYY-MM-DD of completedAt)
  const tasksByDate = useMemo(() => {
    const map: Record<string, CompletedTask[]> = {};
    completedTasks.forEach(t => {
      // Use LOCAL date so it matches the sidebar's displayed date
      const key = toDateKey(new Date(t.completedAt));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [completedTasks]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(new Date(viewYear, viewMonth, d));
    // Pad end to complete the last week row
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(toDateKey(today));
  }

  const todayKey = toDateKey(today);
  const selectedTasks = selectedDay ? (tasksByDate[selectedDay] ?? []) : [];

  // Count tasks in this month
  const monthTaskCount = completedTasks.filter(t => {
    const d = new Date(t.completedAt);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  }).length;

  return (
    <div className="tc-card card">
      {/* ── Header ── */}
      <div className="tc-header">
        <div className="tc-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="tc-title">Task Calendar</span>
          {monthTaskCount > 0 && (
            <span className="tc-month-count">{monthTaskCount} completed this month</span>
          )}
        </div>
        <button type="button" className="tc-today-btn" onClick={goToday}>Today</button>
      </div>

      {/* ── Month Navigation ── */}
      <div className="tc-month-nav">
        <button type="button" className="tc-nav-btn" onClick={prevMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className="tc-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="tc-nav-btn" onClick={nextMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* ── Day Headers ── */}
      <div className="tc-grid tc-day-headers">
        {DAY_HEADERS.map(d => (
          <div key={d} className="tc-day-header">{d}</div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div className="tc-grid tc-cells">
        {calendarDays.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} className="tc-cell tc-cell--empty" />;
          const key = toDateKey(date);
          const tasks = tasksByDate[key] ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          const hasTasks = tasks.length > 0;

          return (
            <div
              key={key}
              className={[
                'tc-cell',
                isToday ? 'tc-cell--today' : '',
                isSelected ? 'tc-cell--selected' : '',
                hasTasks ? 'tc-cell--has-tasks' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(prev => prev === key ? null : key)}
            >
              <span className="tc-day-num">{date.getDate()}</span>
              {hasTasks && (
                <div className="tc-task-chips">
                  {tasks.slice(0, 2).map(t => (
                    <div
                      key={t.id + t.completedAt}
                      className="tc-chip"
                      style={{ background: TAG_COLORS[t.tag] ?? TAG_COLORS.Other }}
                    >
                      {t.title}
                    </div>
                  ))}
                  {tasks.length > 2 && (
                    <div className="tc-chip tc-chip--more">+{tasks.length - 2} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Day Detail Panel ── */}
      {selectedDay && (
        <div className="tc-detail-panel">
          <div className="tc-detail-header">
            <span className="tc-detail-date">
              {(() => {
                const d = new Date(selectedDay + 'T00:00:00');
                return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
              })()}
            </span>
            <button type="button" className="tc-detail-close" onClick={() => setSelectedDay(null)}>×</button>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="tc-detail-empty">No completed tasks on this day.</p>
          ) : (
            <div className="tc-detail-list">
              {selectedTasks.map(t => {
                const tagBg = TAG_COLORS[t.tag] ?? TAG_COLORS.Other;
                return (
                  <div key={t.id + t.completedAt} className="tc-detail-row">
                    <div className="tc-detail-check">
                      <svg width="18" height="18" viewBox="0 0 18 18">
                        <circle cx="9" cy="9" r="8" fill="#2d2926"/>
                        <polyline points="5,9 8,12 13,7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="tc-detail-info">
                      <div className="tc-detail-title-row">
                        <span className="tc-detail-title">{t.title}</span>
                        {t.starred && <span className="tc-detail-star">★</span>}
                      </div>
                      <div className="tc-detail-meta">
                        <span className="tc-detail-tag" style={{ background: tagBg }}>{t.tag}</span>
                        <span className="tc-detail-time">{t.time}</span>
                        <span className="tc-detail-dot">·</span>
                        <span className="tc-detail-done">Done {formatTime(t.completedAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
