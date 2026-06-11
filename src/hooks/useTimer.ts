import { useState, useEffect, useRef, useCallback } from 'react';
import type { FocusSession } from '../types';
import { LS_SESSIONS } from '../types';

interface TimerOptions {
  onComplete?: (itemId: string | null, seconds: number) => void;
  onSessionSaved?: (session: FocusSession) => void;
}

// Persisted timer state so the timer survives background, page reload, and BFCache
const LS_TIMER = 'hd_timer_running';
interface PersistedTimer {
  startedAt: number;     // Date.now() when current run started
  offsetMs: number;      // accumulated ms from previous paused segments
  itemId: string | null;
  sessionStartTime: string; // ISO
}

function loadSessions(fallback: FocusSession[]): FocusSession[] {
  try {
    const v = localStorage.getItem(LS_SESSIONS);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function loadPersistedTimer(): PersistedTimer | null {
  try {
    const v = localStorage.getItem(LS_TIMER);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function savePersistedTimer(t: PersistedTimer | null) {
  if (t) localStorage.setItem(LS_TIMER, JSON.stringify(t));
  else localStorage.removeItem(LS_TIMER);
}

export function useTimer({ onComplete, onSessionSaved }: TimerOptions = {}) {
  const persisted = loadPersistedTimer();

  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>(
    persisted ? 'running' : 'idle'
  );
  // Elapsed is derived from wall-clock on each tick; seed from persisted state
  const [elapsed, setElapsed] = useState<number>(() => {
    if (!persisted) return 0;
    return Math.floor((Date.now() - persisted.startedAt + persisted.offsetMs) / 1000);
  });
  const [sessions, setSessions] = useState<FocusSession[]>(() => loadSessions([]));
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(
    () => persisted ? new Date(persisted.sessionStartTime) : null
  );
  const [currentItemId, setCurrentItemId] = useState<string | null>(
    () => persisted?.itemId ?? null
  );
  const [pendingNotes, setPendingNotes] = useState('');

  // Wall-clock anchor: startedAt + offsetMs give total elapsed
  const startedAtRef = useRef<number | null>(persisted ? persisted.startedAt : null);
  const offsetMsRef  = useRef<number>(persisted ? persisted.offsetMs : 0);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const onCompleteRef     = useRef(onComplete);
  const onSessionSavedRef = useRef(onSessionSaved);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onSessionSavedRef.current = onSessionSaved; }, [onSessionSaved]);

  useEffect(() => {
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    function onSyncLoaded() {
      setSessions(loadSessions([]));
    }
    window.addEventListener('hd-sync-loaded', onSyncLoaded);
    return () => window.removeEventListener('hd-sync-loaded', onSyncLoaded);
  }, []);

  // Start the tick loop (wall-clock based so it's accurate after backgrounding)
  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (startedAtRef.current !== null) {
        const totalMs = Date.now() - startedAtRef.current + offsetMsRef.current;
        setElapsed(Math.floor(totalMs / 1000));
      }
    }, 500); // 500ms tick — fast enough for display, forgiving of throttling
  }, []);

  // If we restored a running timer from localStorage, start ticking immediately
  useEffect(() => {
    if (persisted) startTick();
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When app comes back to foreground (tab switch, phone unlock, BFCache restore)
  // recalculate elapsed immediately from wall-clock instead of waiting for next tick
  useEffect(() => {
    function onVisible() {
      if (status === 'running' && startedAtRef.current !== null) {
        const totalMs = Date.now() - startedAtRef.current + offsetMsRef.current;
        setElapsed(Math.floor(totalMs / 1000));
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [status]);

  function start(itemId: string | null = null) {
    if (status === 'running') return;

    const now = Date.now();
    if (status === 'idle') {
      // Fresh start
      offsetMsRef.current = 0;
      startedAtRef.current = now;
      setSessionStartTime(new Date(now));
      setCurrentItemId(itemId);
    } else {
      // Resume from pause: startedAt = now, keep offsetMs as accumulated
      startedAtRef.current = now;
    }

    const timerState: PersistedTimer = {
      startedAt: startedAtRef.current,
      offsetMs: offsetMsRef.current,
      itemId: status === 'idle' ? itemId : currentItemId,
      sessionStartTime: (status === 'idle' ? new Date(now) : sessionStartTime)?.toISOString() ?? new Date(now).toISOString(),
    };
    savePersistedTimer(timerState);

    setStatus('running');
    startTick();
  }

  function pause() {
    if (tickRef.current) clearInterval(tickRef.current);
    // Accumulate elapsed into offsetMs so resume starts from correct position
    if (startedAtRef.current !== null) {
      offsetMsRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    savePersistedTimer(null); // don't restore paused timer on reload
    setStatus('paused');
  }

  function reset() {
    if (tickRef.current) clearInterval(tickRef.current);
    savePersistedTimer(null);

    // Calculate final elapsed from wall-clock for accuracy
    let finalSeconds = 0;
    if (startedAtRef.current !== null) {
      finalSeconds = Math.floor((Date.now() - startedAtRef.current + offsetMsRef.current) / 1000);
    } else {
      finalSeconds = Math.floor(offsetMsRef.current / 1000);
    }

    if (finalSeconds > 0 && sessionStartTime) {
      const now = new Date();
      const session: FocusSession = {
        id: crypto.randomUUID(),
        startTime: sessionStartTime.toISOString(),
        endTime: now.toISOString(),
        durationSeconds: finalSeconds,
        itemId: currentItemId,
        notes: pendingNotes,
      };
      setSessions(prev => [...prev, session]);
      onCompleteRef.current?.(currentItemId, finalSeconds);
      onSessionSavedRef.current?.(session);
    }

    startedAtRef.current = null;
    offsetMsRef.current = 0;
    setElapsed(0);
    setStatus('idle');
    setSessionStartTime(null);
    setCurrentItemId(null);
    setPendingNotes('');
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  }

  const todayLocal = (() => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  })();
  const todaySessions = sessions.filter(s => {
    if (!s?.startTime) return false;
    const sd = new Date(s.startTime);
    const key = [sd.getFullYear(), String(sd.getMonth() + 1).padStart(2, '0'), String(sd.getDate()).padStart(2, '0')].join('-');
    return key === todayLocal;
  });
  const totalFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);

  function updateSessionGcalId(sessionId: string, gcalEventId: string): void {
    setSessions(prev => {
      const next = prev.map(s => s.id === sessionId ? { ...s, gcalEventId } : s);
      localStorage.setItem(LS_SESSIONS, JSON.stringify(next));
      return next;
    });
  }

  function deleteSession(sessionId: string): void {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== sessionId);
      localStorage.setItem(LS_SESSIONS, JSON.stringify(next));
      return next;
    });
  }

  return {
    status,
    elapsed,
    currentItemId,
    sessions,
    todaySessions,
    totalFocusSeconds,
    pendingNotes,
    setPendingNotes,
    start,
    pause,
    reset,
    formatTime,
    updateSessionGcalId,
    deleteSession,
  };
}
