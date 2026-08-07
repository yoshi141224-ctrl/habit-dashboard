import { useState, useEffect } from 'react';
import type { TimeLog, TimeLogEdits } from '../types';
import { LS_TIMELOGS, LS_TIMELOG_EDITS } from '../types';

function generateSeedTimeLogs(): TimeLog {
  const today = new Date();
  const log: TimeLog = {};

  // Per day: [h1 Meditation, h2 Exercise, h3 Reading, h6 Gratitude, h8 Study] in minutes
  const dailyData: [string, number][][] = [
    [['h1',10],['h2',30],['h3',20],['h6',5],['h8',45]],
    [['h1',10],['h2',35],['h3',25],['h6',5],['h8',55]],
    [['h1',12],['h2',28],['h3',20],['h6',5],['h8',58]],
    [['h1',10],['h2',30],['h3',25],['h6',5],['h8',55]],
    [['h1',10],['h2',28],['h3',20],['h6',5],['h8',45]],
    [['h1', 8],['h2',20],['h3',15],['h6',5],['h8',30]],
  ];

  dailyData.forEach((pairs, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    log[key] = {};
    pairs.forEach(([id, mins]) => {
      log[key][id] = mins * 60;
    });
  });

  return log;
}

/**
 * 「この日のこの項目は、いつ手で直したか」を localStorage に刻む。
 * 描画には使わないので React state には載せない。
 */
function markEdited(date: string, itemId: string) {
  try {
    const edits = load<TimeLogEdits>(LS_TIMELOG_EDITS, {});
    edits[date] = { ...(edits[date] ?? {}), [itemId]: Date.now() };
    localStorage.setItem(LS_TIMELOG_EDITS, JSON.stringify(edits));
  } catch { /* localStorage が使えない環境では諦める */ }
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useTimeLogs() {
  const [timeLogs, setTimeLogs] = useState<TimeLog>(() =>
    load(LS_TIMELOGS, generateSeedTimeLogs())
  );

  useEffect(() => {
    localStorage.setItem(LS_TIMELOGS, JSON.stringify(timeLogs));
  }, [timeLogs]);

  useEffect(() => {
    function onSyncLoaded() {
      setTimeLogs(load(LS_TIMELOGS, generateSeedTimeLogs()));
    }
    window.addEventListener('hd-sync-loaded', onSyncLoaded);
    return () => window.removeEventListener('hd-sync-loaded', onSyncLoaded);
  }, []);

  function addTime(date: string, itemId: string, seconds: number) {
    if (seconds <= 0) return;
    applyDelta(date, itemId, seconds);
  }

  /**
   * 記録済みの時間を増減する（マイナス可）。
   * セッションの実時間を訂正・削除したときに、集計側の合計もズレないよう補正するために使う。
   *
   * タイマーによる積み上げ（addTime）と違って「ユーザーが明示的に直した値」なので、
   * 訂正時刻を記録しておく。Drive同期はこの時刻を見て新しい方を採用する。
   * これが無いと、時間を減らす訂正が MAX 合体で古い大きい値に戻されてしまう。
   */
  function adjustTime(date: string, itemId: string, deltaSeconds: number) {
    if (!deltaSeconds) return;
    markEdited(date, itemId);
    applyDelta(date, itemId, deltaSeconds);
  }

  /** 0 以下になったキーは消して、チャートに空のセグメントが残らないようにする */
  function applyDelta(date: string, itemId: string, deltaSeconds: number) {
    setTimeLogs(prev => {
      const dateLog = { ...(prev[date] ?? {}) };
      const next = Math.max(0, (dateLog[itemId] ?? 0) + deltaSeconds);
      if (next === 0) delete dateLog[itemId];
      else dateLog[itemId] = next;

      if (Object.keys(dateLog).length === 0) {
        const withoutDate = { ...prev };
        delete withoutDate[date];
        return withoutDate;
      }
      return { ...prev, [date]: dateLog };
    });
  }

  function getTimeForDate(date: string): Record<string, number> {
    return timeLogs[date] ?? {};
  }

  return { timeLogs, addTime, adjustTime, getTimeForDate };
}
