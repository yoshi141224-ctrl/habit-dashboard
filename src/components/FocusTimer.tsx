import { useState, useRef, useCallback } from 'react';
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
  sessionItemMeta?: Record<string, { name: string; color: string }>;
  // Google Calendar
  gcalConnected: boolean;
  gcalSyncing: boolean;
  gcalLastError: string | null;
  gcalMobileSetupUrl: string | null;
  onGcalConnect: () => Promise<void>;
  onGcalDisconnect: () => void;
  onGcalSwitchAccount: () => void;
  onDeleteSession?: (id: string) => void;
}

function fmtShort(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m === 0) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`.trim();
}

export default function FocusTimer({
  status, elapsed, todaySessions, totalFocusSeconds,
  pendingNotes, activeItemName, activeItemColor,
  onStart, onPause, onReset, onNotesChange, formatTime,
  sessionItemMeta,
  gcalConnected, gcalSyncing, gcalLastError, gcalMobileSetupUrl,
  onGcalConnect, onGcalDisconnect, onGcalSwitchAccount,
  onDeleteSession,
}: Props) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const copyMobileSetupUrl = useCallback(() => {
    if (!gcalMobileSetupUrl) return;
    navigator.clipboard.writeText(gcalMobileSetupUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }, [gcalMobileSetupUrl]);

  const r = 70, cx = 80, cy = 80;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(elapsed / MAX_SECONDS, 1);
  const dashoffset = circumference * (1 - ratio);
  const arcColor = activeItemColor ?? '#2d2926';
  const lastSession = todaySessions[todaySessions.length - 1] ?? null;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    // スワイプ判定：50px以上 かつ 500ms未満
    if (dy < -50 && dt < 500) setMobileExpanded(true);
    if (dy > 50  && dt < 500) setMobileExpanded(false);
    touchStartY.current = null;
  }

  function handlePeekClick() {
    setMobileExpanded(v => !v);
  }

  function handleStartPause(e: React.MouseEvent) {
    e.stopPropagation();
    status === 'running' ? onPause() : onStart();
  }

  return (
    <>
      {/* モバイル展開時バックドロップ */}
      {mobileExpanded && (
        <div className="ft-backdrop" onClick={() => setMobileExpanded(false)} />
      )}

      <aside
        className={`ft-root${mobileExpanded ? ' ft-root--expanded' : ''}`}
      >
      {/* ── Peek bar (visible on mobile/tablet when collapsed) ── */}
      {/* Touch handlers ONLY here — not on ft-root to prevent iOS Safari
          from intercepting touches anywhere on the screen */}
      <div
        className="ft-peek"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="ft-drag-handle" onClick={handlePeekClick} />
        <div className="ft-peek-row">
          <span className="ft-peek-time">{formatTime(elapsed)}</span>
          {activeItemName ? (
            <span className="ft-peek-item">
              <span className="ft-peek-dot" style={{ background: arcColor }} />
              {activeItemName}
            </span>
          ) : (
            <span className="ft-peek-hint">タップして開く</span>
          )}
          <button
            type="button"
            className="ft-peek-btn"
            style={status === 'running' ? { background: arcColor } : undefined}
            onClick={handleStartPause}
            aria-label={status === 'running' ? 'Pause' : 'Start'}
          >
            {status === 'running' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Full panel content ── */}
      <div className="ft-body">
        <h2 className="ft-heading">フォーカスタイマー</h2>

        {activeItemName && (
          <div
            className="ft-active-item"
            style={{ borderColor: arcColor + '60', background: arcColor + '12' }}
          >
            <span className="ft-active-dot" style={{ background: arcColor }} />
            <span className="ft-active-name">{activeItemName}</span>
            {status === 'running' && (
              <span className="ft-active-pulse" style={{ background: arcColor }} />
            )}
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
            <text x="80" y="76" textAnchor="middle" dominantBaseline="middle"
              fontSize="20" fontWeight="700" fill="#1e1b17"
            >
              {formatTime(elapsed)}
            </text>
            <text x="80" y="98" textAnchor="middle" fontSize="9" fill="#9a938c">
              集中時間
            </text>
          </svg>
        </div>

        <div className="ft-controls">
          <button
            type="button"
            className="ft-btn-start"
            style={status === 'running' ? { background: arcColor } : undefined}
            onClick={status === 'running' ? onPause : onStart}
          >
            {status === 'running' ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
                一時停止
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                {status === 'paused' ? '再開' : '開始'}
              </>
            )}
          </button>
          <button type="button" className="ft-btn-reset" onClick={onReset} title="Stop & save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            >
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.65"/>
            </svg>
          </button>
        </div>

        {!activeItemName && status === 'idle' && (
          <p className="ft-hint">← 習慣またはタスクを選択して時間を記録</p>
        )}

        <div className="ft-section">
          <h3 className="ft-section-title">今日のセッション</h3>
          {todaySessions.length === 0 ? (
            <p className="ft-empty">セッションなし</p>
          ) : (
            <ul className="ft-sessions-list">
              {todaySessions.map((s, i) => {
                const meta = s.itemId ? sessionItemMeta?.[s.itemId] : undefined;
                return (
                  <li key={s.id} className="ft-session-item">
                    {/* Row 1: number + item name */}
                    <div className="ft-session-row1">
                      <span className="ft-session-num">{i + 1}</span>
                      {meta ? (
                        <span
                          className="ft-session-name"
                          style={{ color: meta.color, background: meta.color + '18' }}
                        >
                          <span className="ft-session-name-dot" style={{ background: meta.color }} />
                          {meta.name}
                        </span>
                      ) : (
                        <span className="ft-session-name ft-session-name--empty">フォーカスセッション</span>
                      )}
                      <span className="ft-session-dur">{fmtDuration(s.durationSeconds)}</span>
                      {gcalConnected && (
                        <span className="ft-session-gcal" title="Synced to Google Calendar">📅</span>
                      )}
                      {onDeleteSession && (
                        <button
                          type="button"
                          className="ft-session-del"
                          onClick={() => onDeleteSession(s.id)}
                          title="セッションを削除"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* Row 2: time range */}
                    <div className="ft-session-row2">
                      <span className="ft-session-time">
                        {fmtShort(s.startTime)} – {fmtShort(s.endTime)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="ft-total">
            <span className="ft-total-label">今日の合計</span>
            <span className="ft-total-value">{fmtDuration(totalFocusSeconds)}</span>
          </div>
        </div>

        <div className="ft-section ft-details">
          <h3 className="ft-section-title">セッション詳細</h3>
          <div className="ft-detail-grid">
            <span className="ft-detail-key">開始</span>
            <span className="ft-detail-val">{lastSession ? fmtShort(lastSession.startTime) : '—'}</span>
            <span className="ft-detail-key">終了</span>
            <span className="ft-detail-val">{lastSession ? fmtShort(lastSession.endTime) : '—'}</span>
            <span className="ft-detail-key">集中時間</span>
            <span className="ft-detail-val">{lastSession ? fmtDuration(lastSession.durationSeconds) : '—'}</span>
          </div>
          <div className="ft-notes-section">
            <p className="ft-detail-key">メモ</p>
            <textarea
              className="ft-notes"
              placeholder="集中度はどうでしたか？"
              value={pendingNotes}
              onChange={e => onNotesChange(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* ── Google Calendar Section ── */}
        <div className="ft-section ft-gcal-section">
          <div className="ft-gcal-header">
            <h3 className="ft-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Google Calendar
            </h3>
            {gcalConnected && (
              <span className="ft-gcal-badge ft-gcal-badge--on">
                {gcalSyncing ? '同期中…' : '連携済み ✓'}
              </span>
            )}
          </div>

          {gcalConnected && (
            <div className="ft-gcal-connected">
              <p className="ft-gcal-desc">
                セッション終了時に自動でカレンダーに追加されます
              </p>
              {gcalMobileSetupUrl && (
                <div className="ft-gcal-setup-row">
                  <button
                    type="button"
                    className={`ft-gcal-setup-btn${linkCopied ? ' ft-gcal-setup-btn--copied' : ''}`}
                    onClick={copyMobileSetupUrl}
                  >
                    {linkCopied ? '✓ コピー済み' : '📱 スマホ設定リンクをコピー'}
                  </button>
                  <span className="ft-gcal-setup-hint">スマホで開くと自動設定</span>
                </div>
              )}
              <div className="ft-gcal-btns">
                <button type="button" className="ft-gcal-disconnect" onClick={onGcalDisconnect}>
                  連携を解除
                </button>
                <button type="button" className="ft-gcal-switch" onClick={onGcalSwitchAccount}>
                  別のアカウントで変更
                </button>
              </div>
            </div>
          )}

          {!gcalConnected && (
            <div className="ft-gcal-disconnected">
              <button
                type="button"
                className="ft-gcal-connect-btn"
                onClick={onGcalConnect}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }}
                >
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                Google で連携する
              </button>
            </div>
          )}

          {gcalLastError && (
            <p className="ft-gcal-error">⚠ {gcalLastError}</p>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
