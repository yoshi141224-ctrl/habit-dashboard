export interface SubHabit {
  id: string;
  name: string;
  emoji: string; // empty string if no emoji
}

export interface Habit {
  id: string;
  name: string;
  detail: string;
  emoji: string;  // empty string if none
  createdAt: string;
  subHabits?: SubHabit[];
}

// date → habitId → subHabitId[]
export type SubCompletionMap = Record<string, Record<string, string[]>>;
export const LS_SUB_COMPLETIONS = 'hd_sub_completions';

export type CompletionMap = Record<string, string[]>;

export interface FocusSession {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  itemId: string | null;
  notes: string;
  gcalEventId?: string;
}

// date → itemId → seconds
export type TimeLog = Record<string, Record<string, number>>;

export interface Task {
  id: string;
  title: string;
  tag: string;
  time: string;
  starred: boolean;
  completed: boolean;
  createdAt: string;
}

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface StackedSegment {
  itemId: string;
  name: string;
  color: string;
  seconds: number;
}

export interface StackedBarDatum {
  label: string;
  segments: StackedSegment[];
  totalSeconds: number;
}

export const ITEM_COLORS = [
  '#939b7e', // sage green
  '#c49476', // terracotta
  '#7ba7bc', // slate blue
  '#d4a76a', // warm gold
  '#9b7ead', // soft purple
  '#b8c9a0', // light green
  '#6ab7d4', // sky blue
  '#c97b84', // rose
  '#e8a87c', // peach
  '#82b3a0', // teal
  '#a899c7', // lavender
  '#d4a0a0', // dusty pink
];

export const TAG_COLORS: Record<string, string> = {
  Work: '#f5e6da',
  Study: '#dde8d8',
  Personal: '#dde5ef',
  Health: '#f0dde8',
  Other: '#ece8e0',
};

export interface CompletedTask {
  id: string;
  title: string;
  tag: string;
  time: string;
  starred: boolean;
  completedAt: string; // ISO date string
  createdAt: string;
}

export const LS_HABITS = 'hd_habits';
export const LS_COMPLETIONS = 'hd_completions';
export const LS_SESSIONS = 'hd_sessions';
export const LS_TIMELOGS = 'hd_timelogs';
export const LS_TASKS = 'hd_tasks';
export const LS_COMPLETED_TASKS = 'hd_completed_tasks';
