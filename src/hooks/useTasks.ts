import { useState, useEffect } from 'react';
import type { Task } from '../types';
import { LS_TASKS } from '../types';

const defaultTasks: Task[] = [
  { id: 't1', title: 'Work on project proposal', tag: 'Work', time: '10:00 AM', starred: true, completed: false, createdAt: '2024-01-01' },
  { id: 't2', title: 'Study UI/UX design', tag: 'Study', time: '01:00 PM', starred: true, completed: false, createdAt: '2024-01-01' },
  { id: 't3', title: 'Buy groceries', tag: 'Personal', time: '05:00 PM', starred: false, completed: false, createdAt: '2024-01-01' },
  { id: 't4', title: 'Plan tomorrow\'s schedule', tag: 'Personal', time: '09:00 PM', starred: true, completed: false, createdAt: '2024-01-01' },
];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => load(LS_TASKS, defaultTasks));

  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  function toggleTask(taskId: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  }

  function toggleStar(taskId: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, starred: !t.starred } : t));
  }

  function addTask(title: string, tag: string, time: string) {
    setTasks(prev => [...prev, {
      id: crypto.randomUUID(),
      title, tag, time,
      starred: false,
      completed: false,
      createdAt: new Date().toISOString().slice(0, 10),
    }]);
  }

  function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  return { tasks, toggleTask, toggleStar, addTask, removeTask };
}
