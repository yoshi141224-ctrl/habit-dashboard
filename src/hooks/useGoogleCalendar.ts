import { useState, useEffect, useCallback, useRef } from 'react';
import type { FocusSession } from '../types';

const LS_CLIENT_ID   = 'hd_gcal_client_id';
const LS_ACCESS_TOKEN = 'hd_gcal_access_token';
const LS_TOKEN_EXPIRY = 'hd_gcal_token_expiry';

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
    () => localStorage.getItem(LS_CLIENT_ID) ?? '',
  );
  const [connected,    setConnected]    = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [lastError,    setLastError]    = useState<string | null>(null);

  const tokenRef       = useRef<string | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);

  // Stable callback refs — always point to latest closures
  const callbackRef    = useRef<((resp: TokenResponse) => void) | null>(null);
  const errCallbackRef = useRef<(() => void) | null>(null);

  // Called on every render to keep callbacks fresh
  function _updateCallbacks() {
    callbackRef.current = (resp: TokenResponse) => {
      if (resp.error) {
        if (resp.error !== 'popup_closed_by_user') {
          _redirectConnect(clientId.trim());
        } else {
          setIsConnecting(false);
        }
        return;
      }
      _saveToken(resp);
      setIsConnecting(false);
    };
    errCallbackRef.current = () => {
      _redirectConnect(clientId.trim());
    };
  }
  _updateCallbacks();

  useEffect(() => {
    // 1. Handle OAuth redirect return
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      const expiresIn = Number(params.get('expires_in') ?? 3600);
      if (token) {
        tokenRef.current = token;
        const expiry = Date.now() + expiresIn * 1000;
        localStorage.setItem(LS_ACCESS_TOKEN, token);
        localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
        setConnected(true);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
    }
    // 2. Restore cached token
    const token = localStorage.getItem(LS_ACCESS_TOKEN);
    const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
    if (token && Date.now() < expiry) {
      tokenRef.current = token;
      setConnected(true);
    }
    // 3. Pre-load GIS so token client can be initialized eagerly
    loadGIS().then(() => _initTokenClient()).catch(() => {});
  }, []); // mount only

  // Re-init when clientId changes
  useEffect(() => {
    if (clientId) {
      tokenClientRef.current = null; // reset
      loadGIS().then(() => _initTokenClient()).catch(() => {});
    }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  function _initTokenClient() {
    const id = clientId.trim() || (localStorage.getItem(LS_CLIENT_ID) ?? '');
    if (!id) return;
    const gw = window as unknown as GWindow;
    if (!gw.google?.accounts?.oauth2) return;
    if (tokenClientRef.current) return;
    const config: Record<string, unknown> = {
      client_id: id,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata',
      callback: (resp: TokenResponse) => callbackRef.current?.(resp),
      error_callback: () => errCallbackRef.current?.(),
    };
    // iOS (Safari・Chrome とも WebKit でポップアップがブロック) → redirect mode
    // Android Chrome は window.open() を許可するので popup mode のまま
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) config.ux_mode = 'redirect';
    tokenClientRef.current = gw.google.accounts.oauth2.initTokenClient(config);
  }

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
    if (!id || connected || isConnecting) return connected;
    // iOS は redirect mode のため、自動リダイレクトは避ける
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return false;
    setIsConnecting(true);
    setLastError(null);
    try {
      await loadGIS();
      return await new Promise<boolean>(resolve => {
        // Record<string,unknown> にキャストすることで error_callback など
        // TypeScript の型定義にない GIS オプションも渡せる
        const config: Record<string, unknown> = {
          client_id: id,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata',
          callback: (resp: TokenResponse) => {
            const ok = _saveToken(resp);
            setIsConnecting(false);
            resolve(ok);
          },
          error_callback: () => {
            // prompt:'none' でインタラクション必要なら静かに失敗
            setIsConnecting(false);
            resolve(false);
          },
        };
        const client = (window as unknown as GWindow).google.accounts.oauth2.initTokenClient(config);
        tokenClientRef.current = client;
        // prompt: 'none' → ポップアップ一切なし
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

  // SYNCHRONOUS connect — no await, so iOS user gesture context is preserved
  function connect(): Promise<void> {
    const id = clientId.trim();
    if (!id) {
      setLastError('Google Client ID を入力してください');
      return Promise.resolve();
    }
    setLastError(null);
    setIsConnecting(true);
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken();
    } else {
      _redirectConnect(id);
    }
    return Promise.resolve();
  }

  function disconnect() {
    tokenRef.current = null;
    localStorage.removeItem(LS_ACCESS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
    setConnected(false);
    setLastError(null);
  }

  function getToken(): string | null { return tokenRef.current; }

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
