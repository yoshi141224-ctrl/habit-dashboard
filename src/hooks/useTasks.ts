import { useState, useEffect, useRef } from 'react';
import type { Task, CompletedTask } from '../types';
import { LS_TASKS, LS_COMPLETED_TASKS, LS_DELETED_TASK_IDS } from '../types';

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

// Tombstone helpers — prevent completed/deleted tasks from being re-added by sync
function loadDeletedIds(): Set<string> {
  try {
    const v = localStorage.getItem(LS_DELETED_TASK_IDS);
    return new Set(v ? (JSON.parse(v) as string[]) : []);
  } catch { return new Set(); }
}

function addToTombstone(id: string) {
  const ids = loadDeletedIds();
  ids.add(id);
  localStorage.setItem(LS_DELETED_TASK_IDS, JSON.stringify([...ids]));
}

function removeFromTombstone(id: string) {
  const ids = loadDeletedIds();
  ids.delete(id);
  localStorage.setItem(LS_DELETED_TASK_IDS, JSON.stringify([...ids]));
}

function loadActiveTasks(): Task[] {
  const all = load<Task[]>(LS_TASKS, defaultTasks);
  const deleted = loadDeletedIds();
  return all.filter(t => !deleted.has(t.id));
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => loadActiveTasks());
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>(() =>
    load(LS_COMPLETED_TASKS, [])
  );
  const [pendingCompletions, setPendingCompletions] = useState<Task[]>([]);
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(LS_COMPLETED_TASKS, JSON.stringify(completedTasks));
  }, [completedTasks]);

  useEffect(() => {
    function onSyncLoaded() {
      // loadActiveTasks filters out tombstoned IDs, so sync can't restore deleted tasks
      setTasks(loadActiveTasks());
      setCompletedTasks(load(LS_COMPLETED_TASKS, []));
    }
    window.addEventListener('hd-sync-loaded', onSyncLoaded);
    return () => window.removeEventListener('hd-sync-loaded', onSyncLoaded);
  }, []);

  function toggleTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Write tombstone BEFORE removing from state so sync can never restore this task
    addToTombstone(taskId);

    setTasks(prev => prev.filter(t => t.id !== taskId));
    setPendingCompletions(prev => [...prev, task]);

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

  function undoTask(taskId: string) {
    if (pendingTimers.current[taskId]) {
      clearTimeout(pendingTimers.current[taskId]);
      delete pendingTimers.current[taskId];
    }
    // Remove tombstone so the task can live again
    removeFromTombstone(taskId);
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

  function editTask(taskId: string, title: string, tag: string, time: string) {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, title: title.trim() || t.title, tag, time: time.trim() || t.time }
        : t
    ));
  }

  function removeTask(taskId: string) {
    addToTombstone(taskId);
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
    editTask,
    removeTask,
    removeCompleted,
    clearAllCompleted,
  };
}
