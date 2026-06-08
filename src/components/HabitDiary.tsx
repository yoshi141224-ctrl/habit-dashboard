import { useState, useRef } from 'react';
import './HabitDiary.css';
import type { Habit, CompletionMap, FocusSession } from '../types';
import AddHabitModal from './AddHabitModal';

function formatTimeShort(isoStr: string): string {
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
  habits: Habit[];
  completions: CompletionMap;
  selectedDate: string;
  timeLogs: Record<string, number>;
  sessions: FocusSession[];
  activeItemId: string | null;
  timerRunning: boolean;
  colorMap: Record<string, string>;
  onToggle: (habitId: string, date: string) => void;
  onNavigate: (delta: -1 | 1) => void;
  onSelect: (habitId: string) => void;
  onAddHabit: (name: string, detail: string) => void;
  onRemoveHabit: (id: string) => void;
  onEditHabit: (id: string, name: string, detail: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${DAYS[d.getDay()]}`;
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m === 0) return '';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type EditState = { habitId: string; field: 'name' | 'detail'; value: string } | null;

export default function HabitDiary({
  habits, completions, selectedDate, timeLogs, sessions, activeItemId, timerRunning,
  colorMap, onToggle, onNavigate, onSelect, onAddHabit, onRemoveHabit, onEditHabit,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ habitId: string; x: number; y: number } | null>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent, habitId: string, field: 'name' | 'detail', currentValue: string) {
    e.stopPropagation();
    setEditState({ habitId, field, value: currentValue });
    // autoFocus handles focus via ref after render
  }

  function commitEdit() {
    if (!editState) return;
    const habit = habits.find(h => h.id === editState.habitId);
    if (!habit) { setEditState(null); return; }
    const name  = editState.field === 'name'   ? editState.value.trim() || habit.name : habit.name;
    const detail = editState.field === 'detail' ? editState.value.trim()               : habit.detail;
    onEditHabit(editState.habitId, name, detail);
    setEditState(null);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditState(null); }
  }

  const completed = completions[selectedDate] ?? [];
  const completedCount = completed.length;
  const totalCount = habits.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="hd-card card" onClick={() => contextMenu && setContextMenu(null)}>
      <div className="hd-header">
        <div className="hd-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span className="hd-title">Habit Diary</span>
        </div>
        <div className="hd-date-nav">
          <button type="button" className="hd-nav-btn" onClick={() => onNavigate(-1)}>&#8249;</button>
          <span className="hd-date-label">{formatDate(selectedDate)}</span>
          <button type="button" className="hd-nav-btn" onClick={() => onNavigate(1)}>&#8250;</button>
        </div>
        <button type="button" className="hd-add-btn-header" onClick={() => setShowModal(true)}>
          <span>+</span> Add Habit
        </button>
      </div>

      <div className="hd-grid">
        {habits.map(habit => {
          const isDone = completed.includes(habit.id);
          const isActive = activeItemId === habit.id;
          const spentSec = timeLogs[habit.id] ?? 0;
          const spentLabel = formatMinutes(spentSec);
          const color = colorMap[habit.id] ?? '#9a938c';
          const habitSessions = sessions.filter(s => s.itemId === habit.id);

          return (
            <div
              key={habit.id}
              className={`hd-cell${isDone ? ' hd-cell--done' : ''}${isActive ? ' hd-cell--active' : ''}`}
              style={isActive ? { borderColor: color, background: color + '10' } : undefined}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ habitId: habit.id, x: e.clientX, y: e.clientY }); }}
            >
              {/* Checkbox — toggle completion */}
              <button
                type="button"
                className="hd-checkbox-btn"
                onClick={e => { e.stopPropagation(); onToggle(habit.id, selectedDate); }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="13" fill={isDone ? '#2d2926' : 'none'} stroke={isDone ? '#2d2926' : '#ccc8c4'} strokeWidth="1.5"/>
                  {isDone && (
                    <polyline points="8,14 12,18 20,10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  )}
                </svg>
              </button>

              {/* Text + select for timer */}
              <div
                className="hd-cell-text"
                onClick={() => editState?.habitId !== habit.id && !timerRunning && onSelect(habit.id)}
                title="Click to select for timer · Double-click name/detail to edit"
              >
                {editState?.habitId === habit.id && editState.field === 'name' ? (
                  <input
                    ref={inputRef}
                    className="hd-edit-input hd-edit-name"
                    value={editState.value}
                    autoFocus
                    onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <p
                    className="hd-habit-name"
                    onDoubleClick={e => startEdit(e, habit.id, 'name', habit.name)}
                    title="Double-click to edit"
                  >{habit.name}</p>
                )}
                {editState?.habitId === habit.id && editState.field === 'detail' ? (
                  <input
                    ref={inputRef}
                    className="hd-edit-input hd-edit-detail"
                    value={editState.value}
                    autoFocus
                    onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <p
                    className="hd-habit-detail"
                    onDoubleClick={e => startEdit(e, habit.id, 'detail', habit.detail)}
                    title="Double-click to edit"
                  >{habit.detail}</p>
                )}
                {spentLabel && (
                  <span className="hd-spent" style={{ background: color + '22', color }}>
                    {spentLabel}
                  </span>
                )}
                {habitSessions.length > 0 && (
                  <div className="hd-cell-sessions">
                    {habitSessions.map(s => (
                      <span key={s.id} className="hd-session-entry" style={{ color }}>
                        <span className="hd-session-time">
                          {formatTimeShort(s.startTime)} → {formatTimeShort(s.endTime)}
                        </span>
                        <span className="hd-session-dur"> · {formatDurationShort(s.durationSeconds)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Running indicator */}
              {isActive && timerRunning && (
                <span className="hd-running-dot" style={{ background: color }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="hd-footer">
        <div className="hd-progress-info">
          <span className="hd-progress-text">{completedCount} / {totalCount} habits completed</span>
        </div>
        <div className="hd-progress-track">
          <div className="hd-progress-fill" style={{ width: `${completionRate}%` }} />
        </div>
      </div>

      {showModal && (
        <AddHabitModal onAdd={(name, detail) => { onAddHabit(name, detail); setShowModal(false); }} onClose={() => setShowModal(false)} />
      )}

      {contextMenu && (
        <div
          className="hd-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button type="button" className="hd-context-item hd-context-delete" onClick={() => { onRemoveHabit(contextMenu.habitId); setContextMenu(null); }}>
            Remove habit
          </button>
        </div>
      )}
    </div>
  );
}
