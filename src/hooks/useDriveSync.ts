import { useRef, useCallback, useEffect } from 'react';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'habit-dashboard-sync.json';
const LS_FILE_ID = 'hd_drive_file_id';
const POLL_INTERVAL = 10_000; // 10 seconds

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
  onTokenExpired: () => void; // called on 401 — app should disconnect + prompt reconnect
}

export function useDriveSync({ getToken, onPullComplete, onTokenExpired }: Opts) {
  const fileIdRef           = useRef<string | null>(localStorage.getItem(LS_FILE_ID));
  const pushTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBusyRef           = useRef(false);
  const isPushingRef        = useRef(false);
  const isPollingRef        = useRef(false);
  const initialPullDoneRef  = useRef(true);
  const suppressPushUntilRef = useRef(0);

  // Stable ref so visibility handler always uses latest pull
  const pullRef = useRef<() => Promise<void>>(async () => {});

  async function driveRequest(url: string, opts?: RequestInit): Promise<Response> {
    const token = getToken();
    if (!token) throw new Error('Not connected');
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts?.headers },
    });
    if (res.status === 401) {
      onTokenExpired(); // token expired → disconnect + prompt reconnect
      throw new Error('Token expired (401)');
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
      } catch { /* 401 already handled above */ return null; }
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

  const pull = useCallback(async () => {
    const token = getToken();
    if (!token || isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const id = await getFileId();
      if (!id) {
        initialPullDoneRef.current = true; // no file yet — first-time user, OK to push
        return;
      }
      let r: Response;
      try {
        r = await driveRequest(`${DRIVE_API}/files/${id}?alt=media`);
      } catch { return; } // 401 already handled in driveRequest
      if (!r.ok) { initialPullDoneRef.current = true; return; }

      const remote: DriveSyncData = await r.json();
      initialPullDoneRef.current = true;

      // Compare data contents (not timestamps) to avoid clock-skew false negatives
      let changed = false;
      for (const [key, value] of Object.entries(remote.data)) {
        if (value === undefined || value === null) continue;
        const incoming = JSON.stringify(value);
        if (localStorage.getItem(key) !== incoming) {
          localStorage.setItem(key, incoming);
          changed = true;
        }
      }
      if (!changed) return;

      // Suppress echo-back push for 3 s so we don't immediately re-upload pulled data
      suppressPushUntilRef.current = Date.now() + 3000;
      onPullComplete();
    } catch (e) {
      console.warn('[DriveSync] pull error:', e);
      initialPullDoneRef.current = true;
    } finally {
      isBusyRef.current = false;
    }
  }, [getToken, onPullComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep pullRef up to date for the visibility handler
  useEffect(() => { pullRef.current = pull; }, [pull]);

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
      } catch { /* 401 handled */ }
    } catch (e) {
      console.warn('[DriveSync] push error:', e);
    } finally {
      isPushingRef.current = false;
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedulePush = useCallback(() => {
    if (!initialPullDoneRef.current) return; // wait for first pull
    if (Date.now() < suppressPushUntilRef.current) return; // just pulled
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(push, 3000);
  }, [push]);

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

  // Pull immediately when the user switches back to this tab
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
