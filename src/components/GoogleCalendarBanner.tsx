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
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div className="gcb-root">
      <div className="gcb-inner">

        {/* ── Header ── */}
        <div className="gcb-head">
          <span className="gcb-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </span>
          <div className="gcb-text">
            {hasClientId ? (
              <>
                <p className="gcb-title">Google カレンダーと連携しますか？</p>
                <p className="gcb-desc">タップするだけで習慣チェックやセッションをカレンダーに自動記録。</p>
              </>
            ) : (
              <>
                <p className="gcb-title">Google カレンダーを連携する</p>
                <p className="gcb-desc">習慣チェックやフォーカスセッションをカレンダーに記録できます。</p>
              </>
            )}
          </div>
          <button type="button" className="gcb-close" onClick={onDismiss} aria-label="閉じる">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Client ID 入力（初回 or 変更時のみ） ── */}
        {(!hasClientId || showSetup) && (
          <div className="gcb-setup">
            <p className="gcb-setup-label">Google Cloud Console の OAuth クライアント ID</p>
            <input
              className="gcb-input"
              type="text"
              placeholder="xxxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={e => onClientIdChange(e.target.value)}
              autoFocus={!hasClientId}
            />
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="gcb-help-link"
            >
              クライアント ID の取得方法 →
            </a>
          </div>
        )}

        {/* ── エラー ── */}
        {lastError && (
          <p className="gcb-error">⚠ {lastError}</p>
        )}

        {/* ── ボタン群 ── */}
        <div className="gcb-actions">
          {/* 変更ボタン（設定済みでセットアップ非表示の場合） */}
          {hasClientId && !showSetup && (
            <button
              type="button"
              className="gcb-btn-secondary"
              onClick={() => setShowSetup(true)}
            >
              ID を変更
            </button>
          )}

          {/* 連携ボタン */}
          <button
            type="button"
            className="gcb-btn-connect"
            onClick={onConnect}
            disabled={isConnecting || (!hasClientId && !clientId.trim() && !showSetup)}
          >
            {isConnecting ? (
              <>
                <span className="gcb-spinner" />
                接続中…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
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
