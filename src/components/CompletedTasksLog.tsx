import './CompletedTasksLog.css';
import type { CompletedTask } from '../types';
import { TAG_COLORS } from '../types';

interface Props {
  completedTasks: CompletedTask[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function CompletedTasksLog({ completedTasks, onRemove, onClearAll }: Props) {
  // Group by completion date (YYYY-MM-DD)
  const grouped = completedTasks.reduce<Record<string, CompletedTask[]>>((acc, task) => {
    const date = task.completedAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="ctl-card card">
      {/* Header */}
      <div className="ctl-header">
        <div className="ctl-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <span className="ctl-title">Completed Tasks</span>
          <span className="ctl-count">{completedTasks.length}</span>
        </div>
        {completedTasks.length > 0 && (
          <button className="ctl-clear-btn" onClick={onClearAll}>Clear All</button>
        )}
      </div>

      {/* Empty state */}
      {completedTasks.length === 0 ? (
        <div className="ctl-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc8c4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <p className="ctl-empty-title">No completed tasks yet</p>
          <p className="ctl-empty-sub">Tasks you complete will appear here with dates.</p>
        </div>
      ) : (
        <div className="ctl-groups">
          {sortedDates.map(date => (
            <div key={date} className="ctl-group">
              <div className="ctl-date-header">
                <span className="ctl-date-text">{formatDate(date)}</span>
                <span className="ctl-date-count">{grouped[date].length} task{grouped[date].length > 1 ? 's' : ''}</span>
              </div>
              <div className="ctl-list">
                {grouped[date].map(task => {
                  const tagBg = TAG_COLORS[task.tag] ?? TAG_COLORS.Other;
                  return (
                    <div key={`${task.id}-${task.completedAt}`} className="ctl-row">
                      {/* Done icon */}
                      <div className="ctl-check-icon">
                        <svg width="22" height="22" viewBox="0 0 22 22">
                          <circle cx="11" cy="11" r="10" fill="#2d2926" stroke="#2d2926" strokeWidth="1.5"/>
                          <polyline points="6,11 9.5,14.5 16,8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>

                      {/* Task info */}
                      <div className="ctl-info">
                        <div className="ctl-title-row">
                          <span className="ctl-task-title">{task.title}</span>
                          {task.starred && <span className="ctl-star">★</span>}
                        </div>
                        <div className="ctl-meta">
                          <span className="ctl-tag" style={{ background: tagBg }}>{task.tag}</span>
                          <span className="ctl-time">{task.time}</span>
                          <span className="ctl-dot">·</span>
                          <span className="ctl-completed-at">Done {formatTime(task.completedAt)}</span>
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        className="ctl-remove-btn"
                        onClick={() => onRemove(task.id)}
                        title="Remove from log"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
