import { useState, useEffect } from 'react';
import type { TimeLog } from '../types';
import { LS_TIMELOGS } from '../types';

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

  function addTime(date: string, itemId: string, seconds: number) {
    if (seconds <= 0) return;
    setTimeLogs(prev => {
      const dateLog = prev[date] ?? {};
      return {
        ...prev,
        [date]: { ...dateLog, [itemId]: (dateLog[itemId] ?? 0) + seconds },
      };
    });
  }

  function getTimeForDate(date: string): Record<string, number> {
    return timeLogs[date] ?? {};
  }

  return { timeLogs, addTime, getTimeForDate };
}
