import { useState, useEffect, useCallback, useRef } from 'react';
import type { FocusSession } from '../types';

const LS_CLIENT_ID       = 'hd_gcal_client_id';
const LS_ACCESS_TOKEN    = 'hd_gcal_access_token';
const LS_TOKEN_EXPIRY    = 'hd_gcal_token_expiry';
const LS_EVER_CONNECTED  = 'hd_gcal_ever_connected'; // set once on first successful auth, never cleared
// sessionStorage guard so an auto redirect re-auth can't loop within one tab session.
// Cleared on every successful token, so the next expiry cycle can auto-reconnect again.
const SS_AUTO_REDIRECT   = 'hd_gcal_auto_redirect';

// Pre-configured Client ID — works on every browser without manual setup
const DEFAULT_CLIENT_ID = '1094361881102-d929psrhmiel3o1fk0acks9d3mosfalo.apps.googleusercontent.com';

// ITEM_COLORS hex → Google Calendar colorId (1–11)
// 1=Tomato, 2=Flamingo, 3=Tangerine, 4=Banana, 5=Sage,
// 6=Basil, 7=Peacock, 8=Blueberry, 9=Lavender, 10=Grape, 11=Graphite
const COLOR_MAP: Record<string, string> = {
  '#939b7e': '5',  // sage green   → Sage
  '#c49476': '3',  // terracotta   → Tangerine
  '#7ba7bc': '7',  // slate blue   → Peacock
  '#d4a76a': '4',  // warm gold    → Banana
  '#9b7ead': '10', // soft purple  → Grape
  '#b8c9a0': '5',  // light green  → Sage
  '#6ab7d4': '9',  // sky blue     → Lavender
  '#c97b84': '2',  // rose         → Flamingo
  '#e8a87c': '3',  // peach        → Tangerine
  '#82b3a0': '7',  // teal         → Peacock
  '#a899c7': '9',  // lavender     → Lavender
  '#d4a0a0': '2',  // dusty pink   → Flamingo
};

function toCalendarColorId(hex: string | null): string {
  if (!hex) return '8'; // Blueberry default
  return COLOR_MAP[hex.toLowerCase()] ?? '8';
}

// Lazily load Google Identity Services script
function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as unknown as GWindow).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GIS load failed'));
    document.head.appendChild(s);
  });
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface TokenClient {
  requestAccessToken(opts?: object): void;
}

interface GWindow extends Window {
  google: {
    accounts: {
      oauth2: {
        initTokenClient(config: object): TokenClient;
      };
    };
  };
}

export interface GoogleCalendarHook {
  connected: boolean;
  /** True when the silent token refresh has failed and the user must re-grant access. */
  needsReauth: boolean;
  isConnecting: boolean;
  syncing: boolean;
  lastError: string | null;
  clientId: string;
  setClientId: (id: string) => void;
  connect: () => Promise<void>;
  /** Silent auto-connect — no popup. Returns true if connected. */
  autoConnect: () => Promise<boolean>;
  disconnect: () => void;
  getToken: () => string | null;
  createEvent: (
    session: FocusSession,
    itemName: string,
    itemColor: string | null,
  ) => Promise<string | null>;
  createHabitEvent: (
    dateStr: string,
    habitName: string,
    color: string | null,
  ) => Promise<string | null>;
  deleteEvent: (gcalEventId: string) => Promise<void>;
}

const LS_BANNER_DISMISSED = 'hd_gcal_banner_dismissed';
export const gcalBannerDismissed = () => localStorage.getItem(LS_BANNER_DISMISSED) === '1';
export const dismissGcalBanner   = () => localStorage.setItem(LS_BANNER_DISMISSED, '1');

function readStoredToken(): { token: string; expiry: number } | null {
  const token = localStorage.getItem(LS_ACCESS_TOKEN);
  const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
  if (token && expiry && Date.now() < expiry) return { token, expiry };
  return null;
}

export function useGoogleCalendar(): GoogleCalendarHook {
  const [clientId, setClientIdState] = useState(
    // Always start with the build-time default so stale Drive-synced values can't break OAuth
    () => DEFAULT_CLIENT_ID,
  );
  // Eagerly read from localStorage so the first render is already in the correct connected state.
  // "connected" is sticky: once the user has ever linked Google, we stay connected in the UI
  // even if the access token momentarily expires. The token is refreshed silently in the
  // background, so a transient expiry must never flip the app back to "disconnected".
  // Only an explicit user disconnect clears this.
  const [connected,    setConnected]    = useState(
    () => localStorage.getItem(LS_EVER_CONNECTED) === '1' || readStoredToken() !== null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [lastError,    setLastError]    = useState<string | null>(null);
  const [needsReauth,  setNeedsReauth]  = useState(false);

  // Also eagerly initialize tokenRef so getToken() works from the very first render.
  const tokenRef       = useRef<string | null>(readStoredToken()?.token ?? null);
  const isConnectingRef = useRef(false);

  // Stable ref to autoConnect so useCallback API functions can call it without deps.
  // Updated every render so it always has the latest clientId / connected state.
  const autoConnectRef = useRef<() => Promise<boolean>>(async () => false);
  // Ref to the reconnect-with-redirect-fallback helper (updated each render).
  const reconnectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const hash = window.location.hash;

    // 1. Setup link: #gcal=CLIENT_ID — saves Client ID and auto-triggers OAuth
    if (hash.startsWith('#gcal=')) {
      const id = decodeURIComponent(hash.slice(6)).trim();
      if (id) {
        setClientId(id);
        // If already have a valid token, just restore it
        const cachedToken = localStorage.getItem(LS_ACCESS_TOKEN);
        const cachedExpiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
        if (cachedToken && Date.now() < cachedExpiry) {
          tokenRef.current = cachedToken;
          setConnected(true);
          try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /**/ }
          return;
        }
        // No valid token → auto-redirect to Google OAuth immediately
        _redirectConnect(id);
        return;
      }
    }

    // 2. Handle OAuth redirect return
    if (hash.includes('access_token=') || hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      const errorCode = params.get('error');

      if (errorCode) {
        // Clean URL then show error
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /**/ }
        if (errorCode === 'redirect_uri_mismatch') {
          setLastError('リダイレクトURI未登録 → Google Cloud Console に https://yoshi141224-ctrl.github.io/habit-dashboard/ を追加してください');
        } else {
          setLastError(`Google 認証エラー: ${errorCode}`);
        }
        return;
      }

      if (token) {
        const expiresIn = Number(params.get('expires_in') ?? 3600);
        const expiry = Date.now() + expiresIn * 1000;
        localStorage.setItem(LS_ACCESS_TOKEN, token);
        localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
        localStorage.setItem(LS_EVER_CONNECTED, '1');
        try { sessionStorage.removeItem(SS_AUTO_REDIRECT); } catch { /**/ }
        tokenRef.current = token;
        setConnected(true);
        setNeedsReauth(false);
        setLastError(null);
        try {
          window.history.replaceState(null, '', window.location.origin + window.location.pathname + window.location.search);
        } catch { /**/ }
        return;
      }
    }

    // 3. Restore cached token (handled by useState/useRef eager init above — kept as safety net)
    const stored = readStoredToken();
    if (stored && !tokenRef.current) {
      tokenRef.current = stored.token;
      setConnected(true);
    }

    // 4. Pre-load GIS so autoConnect (silent refresh) is fast
    loadGIS().catch(() => {});

    // 5. If user has previously connected but token is now expired, reconnect.
    //    Try the silent refresh first; if it fails (Arc/Safari block cookies),
    //    fall back to a seamless redirect re-auth. Wait 1.5s so GIS can load.
    const everConnected = localStorage.getItem(LS_EVER_CONNECTED) === '1';
    if (everConnected && !readStoredToken()) {
      setTimeout(() => { reconnectRef.current().catch(() => {}); }, 1500);
    }
  }, []); // mount only

  // Pre-load GIS when clientId becomes available
  useEffect(() => {
    if (clientId) loadGIS().catch(() => {});
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // BFCache restoration: when the browser restores this page from the back-forward cache
  // (e.g. user pressed Back after being redirected to Google OAuth), React effects don't
  // re-run. We use pageshow to re-sync token state so the app isn't stuck blank.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return; // normal page load — already handled
      const stored = readStoredToken();
      if (stored) {
        tokenRef.current = stored.token;
        setConnected(true);
      } else {
        tokenRef.current = null;
        // BFCache restore with no token. If the user has ever connected, keep the
        // connection "alive" in the UI and refresh the token silently — never flip
        // to disconnected on our own.
        const everConnected = localStorage.getItem(LS_EVER_CONNECTED) === '1';
        if (everConnected) {
          setTimeout(() => { autoConnectRef.current().catch(() => {}); }, 300);
        } else {
          setConnected(false);
        }
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive token refresh: every 2 minutes check if the token expires within 15 minutes.
  // If so, call autoConnect (silent prompt:none). Prevents sync from silently dying after 1 hour.
  useEffect(() => {
    const id = setInterval(() => {
      const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
      const fifteenMinutes = 15 * 60 * 1000;
      if (expiry && expiry - Date.now() < fifteenMinutes) {
        autoConnectRef.current().catch(() => {});
      }
    }, 2 * 60 * 1000); // every 2 minutes
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Visibility change: when tab comes back to foreground, keep the token alive.
  // This is the key moment for Arc users — returning to the tab after the 1-hour
  // token died triggers a seamless redirect reconnect so sync just keeps working.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      const everConnected = localStorage.getItem(LS_EVER_CONNECTED) === '1';
      if (!everConnected) return;
      const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
      if (!expiry || Date.now() >= expiry) {
        // Token already dead → reconnect (silent first, then redirect if blocked)
        reconnectRef.current().catch(() => {});
      } else if (Date.now() >= expiry - 5 * 60 * 1000) {
        // Still valid but near expiry → silent refresh only (no redirect needed)
        autoConnectRef.current().catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setClientId(id: string) {
    setClientIdState(id);
    localStorage.setItem(LS_CLIENT_ID, id);
  }

  /** 共通トークン保存ヘルパー */
  function _saveToken(resp: TokenResponse): boolean {
    if (resp.error || !resp.access_token) return false;
    tokenRef.current = resp.access_token;
    const expiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
    localStorage.setItem(LS_ACCESS_TOKEN, resp.access_token);
    localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
    localStorage.setItem(LS_EVER_CONNECTED, '1'); // mark as permanently ever-connected
    try { sessionStorage.removeItem(SS_AUTO_REDIRECT); } catch { /**/ } // allow future auto-reconnect
    setConnected(true);
    setNeedsReauth(false); // fresh token obtained — no re-auth needed
    setLastError(null);
    return true;
  }

  /**
   * サイレント自動接続 — ポップアップ不要。
   * 既にユーザーが同意済みの場合はバックグラウンドでトークン取得。
   * 返り値: 接続成功なら true
   */
  async function autoConnect(): Promise<boolean> {
    const id = clientId.trim();
    if (!id) return false;
    if (isConnectingRef.current) return connected;
    if (connected && getToken()) { setNeedsReauth(false); return true; } // still have a valid token
    isConnectingRef.current = true;
    setIsConnecting(true);
    setLastError(null);
    let ok = false;
    try {
      await loadGIS();
      ok = await new Promise<boolean>(resolve => {
        // 10-second timeout so iOS popup-blocked scenario never hangs
        const timer = setTimeout(() => resolve(false), 10_000);
        const config: Record<string, unknown> = {
          client_id: id,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata',
          callback: (resp: TokenResponse) => { clearTimeout(timer); resolve(_saveToken(resp)); },
          error_callback: () => { clearTimeout(timer); resolve(false); },
        };
        const client = (window as unknown as GWindow).google.accounts.oauth2.initTokenClient(config);
        // prompt:'none' — no popup/redirect, silent token refresh only
        client.requestAccessToken({ prompt: 'none' });
      });
    } catch {
      ok = false;
    } finally {
      isConnectingRef.current = false;
      setIsConnecting(false);
    }
    // If the silent refresh genuinely failed and we have no valid token, the user
    // must re-grant access (prompt:'none' can't recover, e.g. expired Google session
    // or blocked third-party cookies on github.io). Surface that so the UI can prompt
    // a one-tap reconnect — but we still never flip "connected" off on our own.
    if (ok) {
      setNeedsReauth(false);
    } else if (localStorage.getItem(LS_EVER_CONNECTED) === '1' && !readStoredToken()) {
      setNeedsReauth(true);
    }
    return ok;
  }

  // Keep the ref always pointing to the latest autoConnect closure
  autoConnectRef.current = autoConnect;

  /**
   * Reconnect helper: try the silent refresh first; if it fails (e.g. a privacy
   * browser like Arc/Safari blocks the third-party cookies that prompt:'none'
   * needs), fall back to a top-level redirect re-auth. The redirect needs no
   * cookies, and for a PUBLISHED app with an existing grant it bounces straight
   * back with a fresh token — no consent screen. A sessionStorage guard prevents
   * redirect loops; it's cleared on every successful token so the next expiry
   * cycle can auto-reconnect again.
   */
  async function reconnectWithRedirectFallback(): Promise<void> {
    if (localStorage.getItem(LS_EVER_CONNECTED) !== '1') return;
    if (readStoredToken()) return; // token still valid — nothing to do
    const ok = await autoConnect().catch(() => false);
    if (ok || readStoredToken()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // offline — don't redirect to a dead page
    const id = clientId.trim();
    if (!id) return;
    try {
      if (sessionStorage.getItem(SS_AUTO_REDIRECT)) return; // already tried this session
      sessionStorage.setItem(SS_AUTO_REDIRECT, '1');
    } catch { /**/ }
    _redirectConnect(id);
  }
  reconnectRef.current = reconnectWithRedirectFallback;

  /** リダイレクト型 OAuth フロー（モバイルでポップアップがブロックされた場合） */
  function _redirectConnect(id: string) {
    const redirectUri = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata',
      include_granted_scopes: 'true',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Redirect-based connect — works on all browsers without popup permissions
  function connect(): Promise<void> {
    const id = clientId.trim();
    if (!id) {
      setLastError('Google Client ID を入力してください');
      return Promise.resolve();
    }
    setLastError(null);
    setIsConnecting(true);
    _redirectConnect(id);
    return Promise.resolve();
  }

  // Explicit, user-initiated disconnect ("連携を解除" / "別のアカウントで変更").
  // This is now the ONLY way the app becomes disconnected — the token never expires
  // us out automatically. So we clear LS_EVER_CONNECTED to stop background reconnects;
  // otherwise the app would silently re-link right after the user asked to unlink.
  function disconnect() {
    tokenRef.current = null;
    localStorage.removeItem(LS_ACCESS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
    localStorage.removeItem(LS_EVER_CONNECTED);
    setConnected(false);
    setNeedsReauth(false);
    setLastError(null);
  }

  function getToken(): string | null {
    // Return null if token has expired so Drive requests aren't sent with stale token
    const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
    if (expiry && Date.now() >= expiry) {
      tokenRef.current = null;
      return null;
    }
    return tokenRef.current;
  }

  /**
   * Fetch wrapper that retries once after a silent token refresh on 401.
   * Uses getToken() (which checks expiry) so we never waste a round-trip
   * sending an already-expired token to the API.
   * Returns the response on success, or null if both attempts fail.
   */
  async function _fetchWithRetry(url: string, init: RequestInit): Promise<Response | null> {
    // getToken() checks the stored expiry and clears tokenRef if expired.
    // This prevents sending a stale token and getting a needless 401.
    let token = getToken();
    if (!token) {
      const ok = await autoConnectRef.current();
      token = tokenRef.current;
      if (!ok || !token) return null;
    }

    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });

    if (res.status !== 401) return res;

    // 401 despite fresh token — server may have revoked it. Refresh once and retry.
    const refreshed = await autoConnectRef.current();
    if (!refreshed || !tokenRef.current) return null;

    return fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${tokenRef.current}` },
    });
  }

  const createEvent = useCallback(
    async (session: FocusSession, itemName: string, itemColor: string | null): Promise<string | null> => {
      if (session.durationSeconds < 30) return null; // 30秒未満は同期しない
      setSyncing(true);
      setLastError(null);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const body = {
          summary: `🎯 ${itemName}`,
          description: [
            'Habit Dashboard - Focus Session',
            session.notes ? `Notes: ${session.notes}` : '',
            `Duration: ${Math.round(session.durationSeconds / 60)}m`,
          ].filter(Boolean).join('\n'),
          start: { dateTime: session.startTime, timeZone: tz },
          end:   { dateTime: session.endTime,   timeZone: tz },
          colorId: toCalendarColorId(itemColor),
        };
        const res = await _fetchWithRetry(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!res) {
          setLastError('トークンの更新に失敗しました。再接続してください');
          return null;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setLastError((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
          return null;
        }
        const data = await res.json().catch(() => ({}));
        return (data as { id?: string }).id ?? null;
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const createHabitEvent = useCallback(
    async (dateStr: string, habitName: string, color: string | null): Promise<string | null> => {
      setSyncing(true);
      setLastError(null);
      try {
        // 翌日の日付を計算
        const [year, month, day] = dateStr.split('-').map(Number);
        const nextDate = new Date(year, month - 1, day + 1);
        const nextDateStr = [
          nextDate.getFullYear(),
          String(nextDate.getMonth() + 1).padStart(2, '0'),
          String(nextDate.getDate()).padStart(2, '0'),
        ].join('-');
        const body = {
          summary: `✅ ${habitName}`,
          start: { date: dateStr },
          end:   { date: nextDateStr },
          colorId: toCalendarColorId(color),
        };
        const res = await _fetchWithRetry(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!res) {
          setLastError('トークンの更新に失敗しました。再接続してください');
          return null;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setLastError((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
          return null;
        }
        const data = await res.json().catch(() => ({}));
        return (data as { id?: string }).id ?? null;
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteEvent = useCallback(
    async (gcalEventId: string): Promise<void> => {
      try {
        const res = await _fetchWithRetry(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`,
          { method: 'DELETE', headers: {} },
        );
        if (res && !res.ok && res.status !== 404 && res.status !== 410) {
          // 404/410 means already deleted — not an error
          setLastError(`削除エラー: ${res.status}`);
        }
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { connected, needsReauth, isConnecting, syncing, lastError, clientId, setClientId, connect, autoConnect, disconnect, getToken, createEvent, createHabitEvent, deleteEvent };
}
