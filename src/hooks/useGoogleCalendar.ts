import { useState, useEffect, useCallback, useRef } from 'react';
import type { FocusSession } from '../types';

const LS_CLIENT_ID   = 'hd_gcal_client_id';
const LS_ACCESS_TOKEN = 'hd_gcal_access_token';
const LS_TOKEN_EXPIRY = 'hd_gcal_token_expiry';

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
// Note: TokenClient/GWindow are still used by autoConnect's silent-refresh path

export interface GoogleCalendarHook {
  connected: boolean;
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

export function useGoogleCalendar(): GoogleCalendarHook {
  const [clientId, setClientIdState] = useState(
    // Always start with the build-time default so stale Drive-synced values can't break OAuth
    () => DEFAULT_CLIENT_ID,
  );
  const [connected,    setConnected]    = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [lastError,    setLastError]    = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);

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
        // Update state directly — no page reload so no blank screen
        tokenRef.current = token;
        setConnected(true);
        setLastError(null);
        try {
          window.history.replaceState(null, '', window.location.origin + window.location.pathname + window.location.search);
        } catch { /**/ }
        return;
      }
    }

    // 3. Restore cached token
    const token = localStorage.getItem(LS_ACCESS_TOKEN);
    const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
    if (token && Date.now() < expiry) {
      tokenRef.current = token;
      setConnected(true);
    }
    // 4. Pre-load GIS so autoConnect (silent refresh) is fast
    loadGIS().catch(() => {});
  }, []); // mount only

  // Pre-load GIS when clientId becomes available
  useEffect(() => {
    if (clientId) loadGIS().catch(() => {});
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive token refresh: every 5 minutes check if the token expires within 10 minutes.
  // If so, call autoConnect (silent prompt:none). Prevents sync from silently dying after 1 hour.
  useEffect(() => {
    const id = setInterval(() => {
      const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
      const tenMinutes = 10 * 60 * 1000;
      if (expiry && expiry - Date.now() < tenMinutes) {
        // Token is about to expire — try silent refresh
        autoConnect().catch(() => {});
      }
    }, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(id);
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
    setConnected(true);
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
    if (!id || isConnecting) return connected;
    if (connected && getToken()) return true; // still have a valid token
    setIsConnecting(true);
    setLastError(null);
    try {
      await loadGIS();
      return await new Promise<boolean>(resolve => {
        // 10-second timeout so iOS popup-blocked scenario never hangs
        const timer = setTimeout(() => { setIsConnecting(false); resolve(false); }, 10_000);
        const config: Record<string, unknown> = {
          client_id: id,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata',
          callback: (resp: TokenResponse) => {
            clearTimeout(timer);
            const ok = _saveToken(resp);
            setIsConnecting(false);
            resolve(ok);
          },
          error_callback: () => {
            clearTimeout(timer);
            setIsConnecting(false);
            resolve(false);
          },
        };
        const client = (window as unknown as GWindow).google.accounts.oauth2.initTokenClient(config);
        // prompt:'none' — no popup/redirect, silent token refresh only
        client.requestAccessToken({ prompt: 'none' });
      });
    } catch {
      setIsConnecting(false);
      return false;
    }
  }

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

  function disconnect() {
    tokenRef.current = null;
    localStorage.removeItem(LS_ACCESS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
    setConnected(false);
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

  const createEvent = useCallback(
    async (session: FocusSession, itemName: string, itemColor: string | null): Promise<string | null> => {
      if (!tokenRef.current) {
        setLastError('Google カレンダーに接続してください');
        return null;
      }
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
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenRef.current}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          if (res.status === 401) {
            tokenRef.current = null;
            localStorage.removeItem(LS_ACCESS_TOKEN);
            setConnected(false);
            setLastError('トークンが期限切れです。再接続してください');
          } else {
            const err = await res.json().catch(() => ({}));
            setLastError((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
          }
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
    [],
  );

  const createHabitEvent = useCallback(
    async (dateStr: string, habitName: string, color: string | null): Promise<string | null> => {
      if (!tokenRef.current) {
        setLastError('Google カレンダーに接続してください');
        return null;
      }
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
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenRef.current}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          if (res.status === 401) {
            tokenRef.current = null;
            localStorage.removeItem(LS_ACCESS_TOKEN);
            setConnected(false);
            setLastError('トークンが期限切れです。再接続してください');
          } else {
            const err = await res.json().catch(() => ({}));
            setLastError((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
          }
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
    [],
  );

  const deleteEvent = useCallback(
    async (gcalEventId: string): Promise<void> => {
      if (!tokenRef.current) return;
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokenRef.current}`,
            },
          },
        );
        if (res.status === 401) {
          tokenRef.current = null;
          localStorage.removeItem(LS_ACCESS_TOKEN);
          setConnected(false);
          setLastError('トークンが期限切れです。再接続してください');
        }
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  return { connected, isConnecting, syncing, lastError, clientId, setClientId, connect, autoConnect, disconnect, getToken, createEvent, createHabitEvent, deleteEvent };
}
