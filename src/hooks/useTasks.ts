import { useState, useEffect } from 'react';
import type { Task, CompletedTask } from '../types';
import { LS_TASKS, LS_COMPLETED_TASKS } from '../types';

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
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() =>
    load(LS_COMPLETED_TASKS, [])
  );

  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(LS_COMPLETED_TASKS, JSON.stringify(completedTasks));
  }, [completedTasks]);

  // Complete a task: remove from active list, add to completed log with date
  function toggleTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const log: CompletedTask = {
      id: task.id,
      title: task.title,
      tag: task.tag,
      time: task.time,
      starred: task.starred,
      completedAt: new Date().toISOString(),
      createdAt: task.createdAt,
    };
    setCompletedTasks(prev => [log, ...prev]);
    setTasks(prev => prev.filter(t => t.id !== taskId));
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

  function removeCompleted(logId: string) {
    setCompletedTasks(prev => prev.filter(t => t.id !== logId));
  }

  function clearAllCompleted() {
    setCompletedTasks([]);
  }

  return {
    tasks,
    completedTasks,
    toggleTask,
    toggleStar,
    addTask,
    removeTask,
    removeCompleted,
    clearAllCompleted,
  };
}
