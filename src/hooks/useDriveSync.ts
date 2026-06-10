import { useRef, useCallback, useEffect } from 'react';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'habit-dashboard-sync.json';
const LS_FILE_ID = 'hd_drive_file_id';
const LS_LAST_PULL = 'hd_drive_last_pull';
const POLL_INTERVAL = 10_000; // 10 seconds (was 30)

// All localStorage keys to sync
const SYNC_KEYS = [
  'hd_habits', 'hd_completions', 'hd_sub_completions',
  'hd_tasks', 'hd_completed_tasks', 'hd_timelogs',
  'hd_sessions', 'hd_habit_gcal_events',
  'hd_gcal_client_id',
];

export interface DriveSyncData {
  version: number;
  lastModified: number;
  data: Record<string, unknown>;
}

interface Opts {
  getToken: () => string | null;
  onPullComplete: () => void;
}

export function useDriveSync({ getToken, onPullComplete }: Opts) {
  const fileIdRef           = useRef<string | null>(localStorage.getItem(LS_FILE_ID));
  const pushTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBusyRef           = useRef(false);
  const isPollingRef        = useRef(false);
  // Set to false at startPolling(), true after first pull completes.
  // Prevents pushing empty/stale local data before the initial pull finishes.
  const initialPullDoneRef  = useRef(true);
  // Suppress push for N ms after a successful pull to avoid echo-back loops.
  const suppressPushUntilRef = useRef(0);

  async function driveRequest(url: string, opts?: RequestInit): Promise<Response> {
    const token = getToken();
    if (!token) throw new Error('Not connected');
    return fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts?.headers },
    });
  }

  async function getFileId(): Promise<string | null> {
    if (fileIdRef.current) {
      const r = await driveRequest(
        `${DRIVE_API}/files/${fileIdRef.current}?spaces=appDataFolder&fields=id`
      );
      if (r.ok) return fileIdRef.current;
      fileIdRef.current = null;
      localStorage.removeItem(LS_FILE_ID);
    }
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

  const pull = useCallback(async () => {
    const token = getToken();
    if (!token || isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const id = await getFileId();
      if (!id) {
        // No Drive file yet — first time user. OK to push.
        initialPullDoneRef.current = true;
        return;
      }
      const r = await driveRequest(`${DRIVE_API}/files/${id}?alt=media`);
      if (!r.ok) {
        initialPullDoneRef.current = true;
        return;
      }
      const remote: DriveSyncData = await r.json();
      const lastPull = Number(localStorage.getItem(LS_LAST_PULL) ?? 0);

      // Mark initial pull done regardless of whether data changed
      initialPullDoneRef.current = true;

      if (remote.lastModified <= lastPull && remote.lastModified > 0) return; // nothing new

      // Write pulled data to localStorage
      for (const [key, value] of Object.entries(remote.data)) {
        if (value !== undefined && value !== null) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      }
      localStorage.setItem(LS_LAST_PULL, String(remote.lastModified));

      // Suppress echo-back push for 2 s so we don't immediately re-upload pulled data
      suppressPushUntilRef.current = Date.now() + 2000;

      onPullComplete();
    } catch (e) {
      console.warn('[DriveSync] pull error:', e);
      initialPullDoneRef.current = true; // don't block push forever on error
    } finally {
      isBusyRef.current = false;
    }
  }, [getToken, onPullComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback(async () => {
    const token = getToken();
    if (!token) return;
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
      await driveRequest(
        `${UPLOAD_API}/files/${id}?uploadType=multipart`,
        { method: 'PATCH', body: form }
      );
    } catch (e) {
      console.warn('[DriveSync] push error:', e);
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedulePush = useCallback(() => {
    // Don't push before the initial pull has had a chance to run
    if (!initialPullDoneRef.current) return;
    // Don't echo-back data that was just pulled from Drive
    if (Date.now() < suppressPushUntilRef.current) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(push, 3000);
  }, [push]);

  function startPolling() {
    if (isPollingRef.current) return; // already polling
    isPollingRef.current = true;
    initialPullDoneRef.current = false; // must pull before push allowed
    pull();
    pollIntervalRef.current = setInterval(pull, POLL_INTERVAL);
  }

  function stopPolling() {
    isPollingRef.current = false;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pollIntervalRef.current = null;
    pushTimerRef.current = null;
  }

  // Pull immediately when the tab becomes visible (user switches back to the app)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && isPollingRef.current) {
        pull();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pull]);

  useEffect(() => () => stopPolling(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { pull, push, schedulePush, startPolling, stopPolling };
}
