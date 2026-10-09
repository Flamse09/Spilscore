import { liveQuery } from 'dexie';
import { db } from '../db/schema';
import { pull, push, type RemoteClient } from './sync';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastError: string | null;
}

export function nextDelay(failures: number): number {
  return failures === 0 ? 60_000 : Math.min(5_000 * 2 ** (failures - 1), 300_000);
}

let status: SyncStatus = { state: 'idle', pending: 0, lastError: null };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getStatus(): SyncStatus {
  return status;
}

export function subscribe(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let client: RemoteClient | null = null;
let running = false;
let failures = 0;
let loopTimer: ReturnType<typeof setTimeout> | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  clearTimeout(loopTimer);
  loopTimer = setTimeout(syncNow, nextDelay(failures));
}

export async function syncNow(): Promise<void> {
  if (!client || running) return;
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    schedule();
    return;
  }
  running = true;
  setStatus({ state: 'syncing' });
  try {
    if (!(await client.userId())) {
      failures = 0;
      setStatus({ state: 'signed-out', lastError: null });
      return;
    }
    const pushed = await push(client);
    const result = pushed.error ? pushed : await pull(client);
    if (result.error) {
      failures++;
      setStatus({ state: 'error', lastError: result.error });
    } else {
      failures = 0;
      setStatus({ state: 'idle', lastError: null });
    }
  } catch (e) {
    failures++;
    setStatus({ state: 'error', lastError: String(e) });
  } finally {
    running = false;
    schedule();
  }
}

export function requestSync(delay = 2_000): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncNow, delay);
}

export function startSyncLoop(c: RemoteClient): void {
  client = c;
  liveQuery(() => db.outbox.count()).subscribe((n) => {
    const grew = n > status.pending;
    setStatus({ pending: n });
    if (grew) requestSync();
  });
  window.addEventListener('online', () => requestSync(0));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(0);
  });
  requestSync(0);
}
