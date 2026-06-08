import { useState, useEffect, useRef } from 'react';
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
  // Pending completions: tasks that were checked but not yet committed (undo window)
  const [pendingCompletions, setPendingCompletions] = useState<Task[]>([]);
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(LS_COMPLETED_TASKS, JSON.stringify(completedTasks));
  }, [completedTasks]);

  // Complete a task: move to pending for 5s (undo window), then commit to completed log
  function toggleTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Move task out of active list, into pending
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setPendingCompletions(prev => [...prev, task]);

    // Auto-commit after 5 seconds
    pendingTimers.current[taskId] = setTimeout(() => {
      setPendingCompletions(prev => prev.filter(t => t.id !== taskId));
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
      delete pendingTimers.current[taskId];
    }, 5000);
  }

  // Undo a pending completion: restore to active tasks
  function undoTask(taskId: string) {
    if (pendingTimers.current[taskId]) {
      clearTimeout(pendingTimers.current[taskId]);
      delete pendingTimers.current[taskId];
    }
    setPendingCompletions(prev => {
      const task = prev.find(t => t.id === taskId);
      if (task) setTasks(p => [...p, task]);
      return prev.filter(t => t.id !== taskId);
    });
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
    pendingCompletions,
    toggleTask,
    undoTask,
    toggleStar,
    addTask,
    removeTask,
    removeCompleted,
    clearAllCompleted,
  };
}
