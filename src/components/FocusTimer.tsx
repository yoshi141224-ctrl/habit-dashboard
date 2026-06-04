import './FocusTimer.css';
import type { FocusSession } from '../types';

const MAX_SECONDS = 25 * 60;

interface Props {
  status: 'idle' | 'running' | 'paused';
  elapsed: number;
  todaySessions: FocusSession[];
  totalFocusSeconds: number;
  pendingNotes: string;
  activeItemName: string | null;
  activeItemColor: string | null;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onNotesChange: (v: string) => void;
  formatTime: (s: number) => string;
}

function formatTimeShort(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m === 0) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`.trim();
}

export default function FocusTimer({
  status, elapsed, todaySessions, totalFocusSeconds,
  pendingNotes, activeItemName, activeItemColor,
  onStart, onPause, onReset, onNotesChange, formatTime,
}: Props) {
  const r = 70;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(elapsed / MAX_SECONDS, 1);
  const dashoffset = circumference * (1 - ratio);

  const lastSession = todaySessions[todaySessions.length - 1] ?? null;
  const arcColor = activeItemColor ?? '#2d2926';

  return (
    <aside className="ft-root">
      <h2 className="ft-heading">Focus Timer</h2>

      {/* Active item indicator */}
      {activeItemName && (
        <div className="ft-active-item" style={{ borderColor: arcColor + '60', background: arcColor + '12' }}>
          <span className="ft-active-dot" style={{ background: arcColor }} />
          <span className="ft-active-name">{activeItemName}</span>
          {status === 'running' && <span className="ft-active-pulse" style={{ background: arcColor }} />}
        </div>
      )}

      <div className="ft-ring-container">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e4de" strokeWidth="8" strokeDasharray="6 4" />
          {elapsed > 0 && (
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={arcColor} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          )}
          <text x="80" y="76" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="700" fill="#1e1b17">
            {formatTime(elapsed)}
          </text>
          <text x="80" y="98" textAnchor="middle" fontSize="9" fill="#9a938c">Focus Time</text>
        </svg>
      </div>

      <div className="ft-controls">
        <button
          className="ft-btn-start"
          style={status === 'running' ? { background: arcColor } : undefined}
          onClick={status === 'running' ? onPause : onStart}
        >
          {status === 'running' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
              {status === 'paused' ? 'Resume' : 'Start'}
            </>
          )}
        </button>
        <button className="ft-btn-reset" onClick={onReset} title="Stop & save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.65"/>
          </svg>
        </button>
      </div>

      {/* No item selected warning */}
      {!activeItemName && status === 'idle' && (
        <p className="ft-hint">← Select a habit or task to track time</p>
      )}

      <div className="ft-section">
        <h3 className="ft-section-title">Today's Sessions</h3>
        {todaySessions.length === 0 ? (
          <p className="ft-empty">No sessions yet</p>
        ) : (
          <ul className="ft-sessions-list">
            {todaySessions.map((s, i) => (
              <li key={s.id} className="ft-session-item">
                <span className="ft-session-num">{i + 1}</span>
                <span className="ft-session-time">{formatTimeShort(s.startTime)} – {formatTimeShort(s.endTime)}</span>
                <span className="ft-session-dur">{formatDuration(s.durationSeconds)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ft-total">
          <span className="ft-total-label">Total Focus Time</span>
          <span className="ft-total-value">{formatDuration(totalFocusSeconds)}</span>
        </div>
      </div>

      <div className="ft-section ft-details">
        <h3 className="ft-section-title">Session Details</h3>
        <div className="ft-detail-grid">
          <span className="ft-detail-key">Start Time</span>
          <span className="ft-detail-val">{lastSession ? formatTimeShort(lastSession.startTime) : '—'}</span>
          <span className="ft-detail-key">End Time</span>
          <span className="ft-detail-val">{lastSession ? formatTimeShort(lastSession.endTime) : '—'}</span>
          <span className="ft-detail-key">Focus Time</span>
          <span className="ft-detail-val">{lastSession ? formatDuration(lastSession.durationSeconds) : '—'}</span>
        </div>
        <div className="ft-notes-section">
          <p className="ft-detail-key">Notes</p>
          <textarea
            className="ft-notes"
            placeholder="How was your focus?"
            value={pendingNotes}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
          />
        </div>
      </div>
    </aside>
  );
}
