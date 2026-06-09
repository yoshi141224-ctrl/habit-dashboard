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
  syncing: boolean;
  lastError: string | null;
  clientId: string;
  setClientId: (id: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
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

export function useGoogleCalendar(): GoogleCalendarHook {
  const [clientId, setClientIdState] = useState(
    () => localStorage.getItem(LS_CLIENT_ID) ?? '',
  );
  const [connected, setConnected]   = useState(false);
  const [syncing,   setSyncing]     = useState(false);
  const [lastError, setLastError]   = useState<string | null>(null);

  const tokenRef       = useRef<string | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);

  // Restore token from localStorage on mount
  useEffect(() => {
    const token  = localStorage.getItem(LS_ACCESS_TOKEN);
    const expiry = Number(localStorage.getItem(LS_TOKEN_EXPIRY) ?? 0);
    if (token && Date.now() < expiry) {
      tokenRef.current = token;
      setConnected(true);
    }
  }, []);

  function setClientId(id: string) {
    setClientIdState(id);
    localStorage.setItem(LS_CLIENT_ID, id);
  }

  async function connect() {
    const id = clientId.trim();
    if (!id) {
      setLastError('Google Client ID を入力してください');
      return;
    }
    setLastError(null);
    try {
      await loadGIS();
      tokenClientRef.current = (window as unknown as GWindow).google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: (resp: TokenResponse) => {
          if (resp.error) {
            setLastError(resp.error);
            return;
          }
          if (resp.access_token) {
            tokenRef.current = resp.access_token;
            const expiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
            localStorage.setItem(LS_ACCESS_TOKEN, resp.access_token);
            localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
            setConnected(true);
            setLastError(null);
          }
        },
      });
      tokenClientRef.current.requestAccessToken();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }

  function disconnect() {
    tokenRef.current = null;
    localStorage.removeItem(LS_ACCESS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
    setConnected(false);
    setLastError(null);
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

  return { connected, syncing, lastError, clientId, setClientId, connect, disconnect, createEvent, createHabitEvent, deleteEvent };
}
