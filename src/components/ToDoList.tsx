import { useState } from 'react';
import './ToDoList.css';
import type { Task, FocusSession } from '../types';
import { TAG_COLORS } from '../types';
import AddTaskModal from './AddTaskModal';

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
  onRemove: (id: string) => void;
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function ToDoList({
  tasks, pendingCompletions, timeLogs, sessions, activeItemId, timerRunning,
  colorMap, onToggle, onUndo, onStar, onSelect, onAdd, onRemove,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  function handleContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  }

  const completedCount = tasks.filter(t => t.completed).length;

  return (
    <div className="tl-card card" onClick={() => contextMenu && setContextMenu(null)}>
      <div className="tl-header">
        <div className="tl-header-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span className="tl-title">To Do List</span>
          <span className="tl-count">{completedCount}/{tasks.length}</span>
        </div>
        <button type="button" className="tl-add-btn" onClick={() => setShowModal(true)}>
          <span>+</span> Add Task
        </button>
      </div>

      <div className="tl-list">
        {tasks.map(task => {
          const isActive = activeItemId === task.id;
          const spent = timeLogs[task.id] ?? 0;
          const color = colorMap[task.id] ?? '#9a938c';
          const tagBg = TAG_COLORS[task.tag] ?? TAG_COLORS.Other;
          const taskSessions = sessions.filter(s => s.itemId === task.id);

          return (
            <div key={task.id} className="tl-row-group">
              <div
                className={`tl-row${task.completed ? ' tl-row--done' : ''}${isActive ? ' tl-row--active' : ''}`}
                style={isActive ? { borderColor: color } : undefined}
                onClick={() => !timerRunning && onSelect(task.id)}
                onContextMenu={e => handleContextMenu(e, task.id)}
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
                    {task.completed && (
                      <polyline points="5.5,10 8.5,13 14.5,7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    )}
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
              </div>

              {taskSessions.length > 0 && (
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
          <p className="tl-empty">No tasks yet. Add one above!</p>
        )}
      </div>

      {showModal && (
        <AddTaskModal
          onAdd={(title, tag, time) => { onAdd(title, tag, time); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {contextMenu && (
        <div
          className="tl-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button type="button" className="tl-context-delete" onClick={() => { onRemove(contextMenu.id); setContextMenu(null); }}>
            Remove task
          </button>
        </div>
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
                <span className="tl-toast-msg">"{task.title}" completed!</span>
                <button
                  type="button"
                  className="tl-toast-undo"
                  onClick={() => onUndo(task.id)}
                >
                  Undo
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
