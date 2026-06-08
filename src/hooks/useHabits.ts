import { useState, useEffect, useMemo } from 'react';
import type { Habit, CompletionMap, BarChartDatum } from '../types';
import { LS_HABITS, LS_COMPLETIONS } from '../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TODAY = () => new Date().toISOString().slice(0, 10);

const defaultHabits: Habit[] = [
  { id: 'h1', name: 'Meditation', detail: '10 min', createdAt: '2024-01-01' },
  { id: 'h2', name: 'Exercise', detail: '30 min', createdAt: '2024-01-01' },
  { id: 'h3', name: 'Reading', detail: '20 pages', createdAt: '2024-01-01' },
  { id: 'h4', name: 'No Sugar', detail: 'All day', createdAt: '2024-01-01' },
  { id: 'h5', name: 'Early Sleep', detail: 'Before 11PM', createdAt: '2024-01-01' },
  { id: 'h6', name: 'Gratitude', detail: '3 things', createdAt: '2024-01-01' },
  { id: 'h7', name: 'Water', detail: '2L', createdAt: '2024-01-01' },
  { id: 'h8', name: 'Study', detail: '1 hour', createdAt: '2024-01-01' },
];

// Seed completions for last 7 days so charts look populated on first load
function generateSeedCompletions(habits: Habit[]): CompletionMap {
  const countPerDay = [5, 6, 7, 8, 6, 3, 5]; // 6 days ago → today
  const today = new Date();
  const map: CompletionMap = {};
  countPerDay.forEach((count, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    map[key] = habits.slice(0, Math.min(count, habits.length)).map(h => h.id);
  });
  return map;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(() => load(LS_HABITS, defaultHabits));
  const [completions, setCompletions] = useState<CompletionMap>(() =>
    load(LS_COMPLETIONS, generateSeedCompletions(defaultHabits))
  );
  const [selectedDate, setSelectedDate] = useState<string>(TODAY());

  useEffect(() => {
    localStorage.setItem(LS_HABITS, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(LS_COMPLETIONS, JSON.stringify(completions));
  }, [completions]);

  const todayCompletions = completions[selectedDate] ?? [];

  const completionRate = habits.length > 0
    ? Math.round((todayCompletions.length / habits.length) * 100)
    : 0;

  // Streak: consecutive days (ending today) with ≥1 habit completed
  const streak = useMemo(() => {
    let count = 0;
    const d = new Date();
    const todayKey = d.toISOString().slice(0, 10);
    // If today has no completions, start counting from yesterday
    if ((completions[todayKey] ?? []).length === 0) {
      d.setDate(d.getDate() - 1);
    }
    while (count < 366) {
      const key = d.toISOString().slice(0, 10);
      if ((completions[key] ?? []).length === 0) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [completions]);

  // Rolling last 7 days for chart
  const weeklyHabitData: BarChartDatum[] = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const done = (completions[key] ?? []).length;
      const total = habits.length;
      return {
        label: DAY_LABELS[d.getDay()],
        value: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });
  }, [completions, habits]);

  function toggleHabit(habitId: string, date: string = selectedDate) {
    setCompletions(prev => {
      const current = prev[date] ?? [];
      const updated = current.includes(habitId)
        ? current.filter(id => id !== habitId)
        : [...current, habitId];
      return { ...prev, [date]: updated };
    });
  }

  function addHabit(name: string, detail: string) {
    const habit: Habit = {
      id: crypto.randomUUID(),
      name,
      detail,
      createdAt: TODAY(),
    };
    setHabits(prev => [...prev, habit]);
  }

  function removeHabit(habitId: string) {
    setHabits(prev => prev.filter(h => h.id !== habitId));
    setCompletions(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(date => {
        next[date] = next[date].filter(id => id !== habitId);
      });
      return next;
    });
  }

  function editHabit(habitId: string, name: string, detail: string) {
    setHabits(prev => prev.map(h =>
      h.id === habitId ? { ...h, name: name.trim() || h.name, detail: detail.trim() } : h
    ));
  }

  function navigateDate(delta: -1 | 1) {
    setSelectedDate(prev => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      const next = d.toISOString().slice(0, 10);
      // Block navigation into the future
      if (next > TODAY()) return prev;
      return next;
    });
  }

  return {
    habits,
    completions,
    selectedDate,
    todayCompletions,
    completionRate,
    streak,
    weeklyHabitData,
    toggleHabit,
    addHabit,
    removeHabit,
    editHabit,
    setSelectedDate,
    navigateDate,
  };
}
