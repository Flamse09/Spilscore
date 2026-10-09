import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { nextDelay, startSyncLoop, syncNow } from '../../src/sync/runner';

describe('nextDelay', () => {
  it('polls every minute when healthy', () => {
    expect(nextDelay(0)).toBe(60_000);
  });

  it('backs off exponentially and caps at 5 minutes', () => {
    expect(nextDelay(1)).toBe(5_000);
    expect(nextDelay(2)).toBe(10_000);
    expect(nextDelay(4)).toBe(40_000);
    expect(nextDelay(20)).toBe(300_000);
  });
});

describe('syncNow while a sync is in flight', () => {
  it('runs a second sync instead of dropping the request', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'hidden' });
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    startSyncLoop({
      async userId() { calls++; if (calls === 1) await gate; return null; },
      async upsert() { return null; },
      async fetchSince() { return { rows: [], error: null }; },
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    await syncNow(); // in flight: must be remembered
    release();
    await vi.waitFor(() => expect(calls).toBe(2), { timeout: 5_000 });
    vi.unstubAllGlobals();
  });
});
