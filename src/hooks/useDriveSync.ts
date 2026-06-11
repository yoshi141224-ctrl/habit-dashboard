import { useRef, useCallback, useEffect } from 'react';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'habit-dashboard-sync.json';
const LS_FILE_ID = 'hd_drive_file_id';
const POLL_INTERVAL = 3_000; // 3 seconds

const SYNC_KEYS = [
  'hd_habits', 'hd_completions', 'hd_sub_completions',
  'hd_tasks', 'hd_completed_tasks', 'hd_timelogs',
  'hd_sessions', 'hd_habit_gcal_events',
  // hd_gcal_client_id is intentionally excluded: each device uses the build-time default
];

export interface DriveSyncData {
  version: number;
  lastModified: number;
  data: Record<string, unknown>;
}

interface Opts {
  getToken: () => string | null;
  onPullComplete: () => void;
  onTokenExpired: () => void;
}

// ── Merge helpers ─────────────────────────────────────────────
// For completion maps: union so checks from all devices are preserved.
// "Last uncheck wins" is not supported intentionally — union is safe for habit tracking.

function mergeCompletions(
  local: Record<string, string[]>,
  remote: Record<string, string[]>,
): Record<string, string[]> {
  const merged = { ...local };
  for (const [date, ids] of Object.entries(remote)) {
    const localIds = local[date] ?? [];
    merged[date] = [...new Set([...localIds, ...(ids as string[])])];
  }
  return merged;
}

function mergeSubCompletions(
  local: Record<string, Record<string, string[]>>,
  remote: Record<string, Record<string, string[]>>,
): Record<string, Record<string, string[]>> {
  const merged = { ...local };
  for (const [date, byHabit] of Object.entries(remote)) {
    const localByHabit = local[date] ?? {};
    const mergedByHabit = { ...localByHabit };
    for (const [habitId, subIds] of Object.entries(byHabit as Record<string, string[]>)) {
      const localSubIds = localByHabit[habitId] ?? [];
      mergedByHabit[habitId] = [...new Set([...localSubIds, ...subIds])];
    }
    merged[date] = mergedByHabit;
  }
  return merged;
}

export function useDriveSync({ getToken, onPullComplete, onTokenExpired }: Opts) {
  const fileIdRef          = useRef<string | null>(localStorage.getItem(LS_FILE_ID));
  const pushTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBusyRef          = useRef(false);
  const isPushingRef       = useRef(false);
  const isPollingRef       = useRef(false);
  const initialPullDoneRef = useRef(true);

  // Stable refs so callbacks always call the latest version
  const pullRef = useRef<() => Promise<void>>(async () => {});
  const pushRef = useRef<() => Promise<void>>(async () => {});

  async function driveRequest(url: string, opts?: RequestInit): Promise<Response> {
    const token = getToken();
    if (!token) throw new Error('Not connected');
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts?.headers },
    });
    if (res.status === 401 || res.status === 403) {
      onTokenExpired();
      throw new Error(`Drive auth error (${res.status})`);
    }
    return res;
  }

  async function getFileId(): Promise<string | null> {
    if (fileIdRef.current) {
      try {
        const r = await driveRequest(
          `${DRIVE_API}/files/${fileIdRef.current}?spaces=appDataFolder&fields=id`
        );
        if (r.ok) return fileIdRef.current;
      } catch { return null; }
      fileIdRef.current = null;
      localStorage.removeItem(LS_FILE_ID);
    }
    try {
      const r = await driveRequest(
        `${DRIVE_API}/files?spaces=appDataFolder&q=name='${FILE_NAME}'&fields=files(id,modifiedTime)`
      );
      if (!r.ok) return null;
      const list = await r.json();
      if (list.files?.length > 0) {
        const id = list.files[0].id;
        fileIdRef.current = id;
        localStorage.setItem(LS_FILE_ID, id);
        return id;
      }
      return null;
    } catch { return null; }
  }

  async function createFile(): Promise<string> {
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const initial: DriveSyncData = { version: 1, lastModified: 0, data: {} };
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('media', new Blob([JSON.stringify(initial)], { type: 'application/json' }));
    const r = await driveRequest(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
      { method: 'POST', body: form }
    );
    if (!r.ok) throw new Error('Failed to create sync file');
    const { id } = await r.json();
    fileIdRef.current = id;
    localStorage.setItem(LS_FILE_ID, id);
    return id;
  }

  const push = useCallback(async () => {
    const token = getToken();
    if (!token || isPushingRef.current) return;
    isPushingRef.current = true;
    try {
      let id = await getFileId();
      if (!id) id = await createFile();
      const snapshot: Record<string, unknown> = {};
      for (const key of SYNC_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try { snapshot[key] = JSON.parse(raw); } catch { snapshot[key] = raw; }
        }
      }
      const payload: DriveSyncData = {
        version: 1,
        lastModified: Date.now(),
        data: snapshot,
      };
      const form = new FormData();
      form.append('metadata', new Blob(['{}'], { type: 'application/json' }));
      form.append('media', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      try {
        await driveRequest(
          `${UPLOAD_API}/files/${id}?uploadType=multipart`,
          { method: 'PATCH', body: form }
        );
      } catch { /* 401/403 handled */ }
    } catch (e) {
      console.warn('[DriveSync] push error:', e);
    } finally {
      isPushingRef.current = false;
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { pushRef.current = push; }, [push]);

  const pull = useCallback(async () => {
    const token = getToken();
    if (!token || isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const id = await getFileId();
      if (!id) {
        initialPullDoneRef.current = true;
        return;
      }
      let r: Response;
      try {
        r = await driveRequest(`${DRIVE_API}/files/${id}?alt=media`);
      } catch { return; }
      if (!r.ok) { initialPullDoneRef.current = true; return; }

      const remote: DriveSyncData = await r.json();
      initialPullDoneRef.current = true;

      let changed = false;
      for (const [key, value] of Object.entries(remote.data)) {
        if (value === undefined || value === null) continue;

        const localRaw = localStorage.getItem(key);

        if (key === 'hd_completions') {
          // Union-merge: checks from all devices are preserved
          const localVal: Record<string, string[]> = localRaw ? JSON.parse(localRaw) : {};
          const merged = mergeCompletions(localVal, value as Record<string, string[]>);
          const mergedStr = JSON.stringify(merged);
          if (mergedStr !== localRaw) {
            localStorage.setItem(key, mergedStr);
            changed = true;
          }
          continue;
        }

        if (key === 'hd_sub_completions') {
          const localVal: Record<string, Record<string, string[]>> = localRaw ? JSON.parse(localRaw) : {};
          const merged = mergeSubCompletions(localVal, value as Record<string, Record<string, string[]>>);
          const mergedStr = JSON.stringify(merged);
          if (mergedStr !== localRaw) {
            localStorage.setItem(key, mergedStr);
            changed = true;
          }
          continue;
        }

        // For all other keys: remote wins (last-write-wins)
        const incoming = JSON.stringify(value);
        if (localRaw !== incoming) {
          localStorage.setItem(key, incoming);
          changed = true;
        }
      }

      if (!changed) return;

      // Push merged result back to Drive so all other devices converge to the same state
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => pushRef.current(), 2000);

      onPullComplete();
    } catch (e) {
      console.warn('[DriveSync] pull error:', e);
      initialPullDoneRef.current = true;
    } finally {
      isBusyRef.current = false;
    }
  }, [getToken, onPullComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { pullRef.current = pull; }, [pull]);

  const schedulePush = useCallback(() => {
    if (!initialPullDoneRef.current) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushRef.current(), 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling(): Promise<void> {
    if (isPollingRef.current) return Promise.resolve();
    isPollingRef.current = true;
    initialPullDoneRef.current = false;
    const firstPull = pull();
    pollIntervalRef.current = setInterval(() => pullRef.current(), POLL_INTERVAL);
    return firstPull;
  }

  function stopPolling() {
    isPollingRef.current = false;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pollIntervalRef.current = null;
    pushTimerRef.current = null;
  }

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && isPollingRef.current) {
        pullRef.current();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => () => stopPolling(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { pull, push, schedulePush, startPolling, stopPolling };
}
