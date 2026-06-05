import { useState, useEffect, useRef } from 'react';
import type { FocusSession } from '../types';
import { LS_SESSIONS } from '../types';

interface TimerOptions {
  onComplete?: (itemId: string | null, seconds: number) => void;
  onSessionSaved?: (session: FocusSession) => void;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useTimer({ onComplete, onSessionSaved }: TimerOptions = {}) {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<FocusSession[]>(() => load(LS_SESSIONS, []));
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onSessionSavedRef = useRef(onSessionSaved);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onSessionSavedRef.current = onSessionSaved; }, [onSessionSaved]);

  useEffect(() => {
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function start(itemId: string | null = null) {
    if (status !== 'running') {
      if (status === 'idle') {
        setSessionStartTime(new Date());
        setCurrentItemId(itemId);
      }
      setStatus('running');
      intervalRef.current = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    }
  }

  function pause() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('paused');
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (elapsed > 0 && sessionStartTime) {
      const now = new Date();
      const session: FocusSession = {
        id: crypto.randomUUID(),
        startTime: sessionStartTime.toISOString(),
        endTime: now.toISOString(),
        durationSeconds: elapsed,
        itemId: currentItemId,
        notes: pendingNotes,
      };
      setSessions(prev => [...prev, session]);
      onCompleteRef.current?.(currentItemId, elapsed);
      onSessionSavedRef.current?.(session);
    }
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

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter(s => s.startTime.slice(0, 10) === today);
  const totalFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);

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
  };
}
