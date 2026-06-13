import { useState, useRef } from 'react';
import './ToDoList.css';
import type { Task, FocusSession } from '../types';
import { TAG_COLORS } from '../types';
import AddTaskModal from './AddTaskModal';

const TAGS = Object.keys(TAG_COLORS);

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

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface Props {
  tasks: Task[];
  pendingCompletions: Task[];
  timeLogs: Record<string, number>;
  sessions: FocusSession[];
  activeItemId: string | null;
  timerRunning: boolean;
  colorMap: Record<string, string>;
  onToggle: (id: string) => void;
  onUndo: (id: string) => void;
  onStar: (id: string) => void;
  onSelect: (id: string) => void;
  onAdd: (title: string, tag: string, time: string) => void;
  onEdit: (id: string, title: string, tag: string, time: string) => void;
  onRemove: (id: string) => void;
}

type EditState = { id: string; title: string; tag: string; time: string } | null;

export default function ToDoList({
  tasks, pendingCompletions, timeLogs, sessions, activeItemId, timerRunning,
  colorMap, onToggle, onUndo, onStar, onSelect, onAdd, onEdit, onRemove,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editState, setEditState] = useState<EditState>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  function startEdit(task: Task) {
    setEditState({ id: task.id, title: task.title, tag: task.tag, time: task.time });
  }

  function commitEdit() {
    if (!editState) return;
    onEdit(editState.id, editState.title, editState.tag, editState.time);
    setEditState(null);
  }

  const completedCount = tasks.filter(t => t.completed).length;

  return (
    <div className="tl-card card" onClick={() => editState && commitEdit()}>
      <div className="tl-header">
        <div className="tl-header-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span className="tl-title">タスクリスト</span>
          <span className="tl-count">{completedCount}/{tasks.length}</span>
        </div>
        <button type="button" className="tl-add-btn" onClick={e => { e.stopPropagation(); setShowModal(true); }}>
          <span>+</span> タスクを追加
        </button>
      </div>

      <div className="tl-list">
        {tasks.map(task => {
          const isActive = activeItemId === task.id;
          const isEditing = editState?.id === task.id;
          const spent = timeLogs[task.id] ?? 0;
          const color = colorMap[task.id] ?? '#9a938c';
          const tagBg = TAG_COLORS[task.tag] ?? TAG_COLORS.Other;
          const taskSessions = sessions.filter(s => s.itemId === task.id);

          return (
            <div key={task.id} className="tl-row-group">
              {isEditing ? (
                /* ── Inline Edit Form ── */
                <div
                  className="tl-edit-form"
                  onClick={e => e.stopPropagation()}
                  onBlur={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) commitEdit();
                  }}
                >
                  {/* Title input — Enter moves to time */}
                  <input
                    className="tl-edit-title"
                    value={editState!.title}
                    autoFocus
                    placeholder="タスク名"
                    onChange={e => setEditState(prev => prev ? { ...prev, title: e.target.value } : null)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  { e.preventDefault(); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditState(null); }
                    }}
                  />
                  <div className="tl-edit-row2">
                    <select
                      className="tl-edit-tag"
                      value={editState!.tag}
                      style={{ background: TAG_COLORS[editState!.tag] ?? TAG_COLORS.Other }}
                      onChange={e => setEditState(prev => prev ? { ...prev, tag: e.target.value } : null)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditState(null); }}
                    >
                      {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      ref={timeInputRef}
                      className="tl-edit-time"
                      value={editState!.time}
                      placeholder="時間"
                      onChange={e => setEditState(prev => prev ? { ...prev, time: e.target.value } : null)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditState(null); }
                      }}
                    />
                    <button type="button" className="tl-edit-save"
                      tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={commitEdit}>✓</button>
                    <button type="button" className="tl-edit-cancel"
                      tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => setEditState(null)}>×</button>
                  </div>
                </div>
              ) : (
                /* ── Normal Task Row ── */
                <div
                  className={`tl-row${task.completed ? ' tl-row--done' : ''}${isActive ? ' tl-row--active' : ''}`}
                  style={isActive ? { borderColor: color } : undefined}
                  onClick={() => !timerRunning && onSelect(task.id)}
                >
                  {/* Color bar */}
                  <div className="tl-color-bar" style={{ background: isActive ? color : 'transparent' }} />

                  {/* Checkbox */}
                  <button
                    type="button"
                    className="tl-checkbox"
                    onClick={e => { e.stopPropagation(); onToggle(task.id); }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="9"
                        fill={task.completed ? '#2d2926' : 'none'}
                        stroke={task.completed ? '#2d2926' : '#ccc8c4'}
                        strokeWidth="1.5"
                      />
                      <polyline points="5.5,10 8.5,13 14.5,7" fill="none" stroke="#fff"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        opacity={task.completed ? 1 : 0}
                      />
                    </svg>
                  </button>

                  {/* Title */}
                  <span className="tl-task-title">{task.title}</span>

                  {/* Tag */}
                  <span className="tl-tag" style={{ background: tagBg }}>{task.tag}</span>

                  {/* Time */}
                  <span className="tl-time">{task.time}</span>

                  {/* Time spent badge */}
                  {spent > 0 && (
                    <span className="tl-spent" style={{ background: color + '22', color }}>
                      {formatMinutes(spent)}
                    </span>
                  )}

                  {/* Active indicator */}
                  {isActive && timerRunning && (
                    <span className="tl-running-dot" style={{ background: color }} />
                  )}

                  {/* Star */}
                  <button
                    type="button"
                    className={`tl-star${task.starred ? ' tl-star--filled' : ''}`}
                    onClick={e => { e.stopPropagation(); onStar(task.id); }}
                  >
                    {task.starred ? '★' : '☆'}
                  </button>

                  {/* Edit button */}
                  <button
                    type="button"
                    className="tl-row-edit-btn"
                    onClick={e => { e.stopPropagation(); startEdit(task); }}
                    aria-label="編集"
                    title="編集"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    className="tl-row-delete-btn"
                    onClick={e => { e.stopPropagation(); onRemove(task.id); }}
                    aria-label="削除"
                    title="削除"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              )}

              {/* Session log */}
              {taskSessions.length > 0 && !isEditing && (
                <div className="tl-sessions" style={{ borderLeftColor: color + '60' }}>
                  {taskSessions.map(s => (
                    <span key={s.id} className="tl-session-entry" style={{ color }}>
                      <span className="tl-session-time">
                        {formatTimeShort(s.startTime)} → {formatTimeShort(s.endTime)}
                      </span>
                      <span className="tl-session-dur"> · {formatDurationShort(s.durationSeconds)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="tl-empty">タスクはまだありません。上から追加してください！</p>
        )}
      </div>

      {showModal && (
        <AddTaskModal
          onAdd={(title, tag, time) => { onAdd(title, tag, time); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Undo toast stack */}
      {pendingCompletions.length > 0 && (
        <div className="tl-toast-stack" onClick={e => e.stopPropagation()}>
          {pendingCompletions.map(task => (
            <div key={task.id} className="tl-toast">
              <div className="tl-toast-top">
                <svg width="14" height="14" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                  <circle cx="10" cy="10" r="9" fill="#4a9e5c" />
                  <polyline points="5.5,10 8.5,13 14.5,7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="tl-toast-msg">「{task.title}」完了！</span>
                <button type="button" className="tl-toast-undo" onClick={() => onUndo(task.id)}>
                  取り消し
                </button>
              </div>
              <div className="tl-toast-bar-track">
                <div className="tl-toast-bar" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
