import { useState } from 'react';
import './GoogleCalendarBanner.css';

interface Props {
  /** Client ID が登録済みで連携待ちの場合 true */
  hasClientId: boolean;
  isConnecting: boolean;
  lastError: string | null;
  clientId: string;
  onClientIdChange: (v: string) => void;
  onConnect: () => Promise<void>;
  onDismiss: () => void;
}

export default function GoogleCalendarBanner({
  hasClientId,
  isConnecting,
  lastError,
  clientId,
  onClientIdChange,
  onConnect,
  onDismiss,
}: Props) {
  const [showInput, setShowInput] = useState(!hasClientId);

  return (
    <div className="gcb-root">
      <div className="gcb-inner">
        {/* Icon + message */}
        <div className="gcb-head">
          <span className="gcb-icon">
            {/* Google Calendar icon (simplified) */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </span>
          <div className="gcb-text">
            {hasClientId ? (
              <>
                <p className="gcb-title">Google カレンダーと連携しますか？</p>
                <p className="gcb-desc">以前設定した Client ID が見つかりました。ワンタップで再接続できます。</p>
              </>
            ) : (
              <>
                <p className="gcb-title">Google カレンダーを連携する</p>
                <p className="gcb-desc">習慣チェックやフォーカスセッションをカレンダーに自動記録できます。</p>
              </>
            )}
          </div>
          <button type="button" className="gcb-close" onClick={onDismiss} aria-label="閉じる">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Setup form (Client ID input) */}
        {showInput && (
          <div className="gcb-setup">
            <p className="gcb-setup-hint">
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="gcb-link"
              >Google Cloud Console</a> で OAuth 2.0 クライアント ID を作成し、
              <strong>承認済みの JavaScript 生成元</strong>に
              <code>https://yoshi141224-ctrl.github.io</code> を追加してください。
            </p>
            <input
              className="gcb-input"
              type="text"
              placeholder="xxxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={e => onClientIdChange(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Error */}
        {lastError && (
          <p className="gcb-error">⚠ {lastError}</p>
        )}

        {/* Actions */}
        <div className="gcb-actions">
          {hasClientId && !showInput && (
            <button
              type="button"
              className="gcb-btn-secondary"
              onClick={() => setShowInput(true)}
            >
              別のアカウントで設定
            </button>
          )}
          <button
            type="button"
            className="gcb-btn-connect"
            onClick={onConnect}
            disabled={isConnecting || (!hasClientId && !clientId.trim())}
          >
            {isConnecting ? (
              <>
                <span className="gcb-spinner" />
                接続中…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                Google で連携する
              </>
            )}
          </button>
          <button type="button" className="gcb-btn-skip" onClick={onDismiss}>
            後で
          </button>
        </div>
      </div>
    </div>
  );
}
