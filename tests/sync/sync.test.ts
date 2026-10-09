import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, ensureBuiltInGames, startSession } from '../../src/db/actions';
import { db, type BaseRow, type TableName } from '../../src/db/schema';
import { pull, push, type RemoteClient } from '../../src/sync/sync';

function fakeRemote(uid: string | null = 'user-1') {
  const tables = new Map<string, Map<string, BaseRow>>();
  const calls: { table: TableName; rows: BaseRow[] }[] = [];
  let failWith: string | null = null;
  const client: RemoteClient = {
    async userId() { return uid; },
    async upsert(table, rows) {
      if (failWith) return failWith;
      calls.push({ table, rows });
      const t = tables.get(table) ?? new Map<string, BaseRow>();
      for (const r of rows) t.set(r.id, structuredClone(r));
      tables.set(table, t);
      return null;
    },
    async fetchSince(table, since) {
      const rows = [...(tables.get(table)?.values() ?? [])]
        .filter((r) => !since || r.updated_at >= since)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      return { rows: rows.map((r) => structuredClone(r)), error: null };
    },
  };
  return { client, tables, calls, fail: (msg: string | null) => { failWith = msg; } };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

describe('push', () => {
  it('does nothing when signed out', async () => {
    await addPlayer('Anna');
    const r = fakeRemote(null);
    expect(await push(r.client)).toEqual({ pushed: 0, error: null });
    expect(await db.outbox.count()).toBe(1);
  });

  it('sends rows in FK order with owner_id and clears the outbox', async () => {
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    await startSession('00000000-0000-4000-8000-000000000002', {}, [
      { playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null },
    ], []);
    const r = fakeRemote();
    const res = await push(r.client);
    expect(res.error).toBeNull();
    expect(r.calls.map((c) => c.table)).toEqual(['players', 'sessions', 'session_players']);
    expect(r.calls[0].rows.every((row) => row.owner_id === 'user-1')).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.players.get(a.id))!.owner_id).toBe('user-1');
  });

  it('keeps the outbox when the server fails', async () => {
    await addPlayer('Anna');
    const r = fakeRemote();
    r.fail('netværksfejl');
    expect(await push(r.client)).toEqual({ pushed: 0, error: 'netværksfejl' });
    expect(await db.outbox.count()).toBe(1);
  });

  it('never pushes built-in games', async () => {
    await db.outbox.add({ table: 'games', row_id: '00000000-0000-4000-8000-000000000001' });
    const r = fakeRemote();
    await push(r.client);
    expect(r.calls).toEqual([]);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('pull', () => {
  it('restores rows into an empty device without queueing them', async () => {
    const r = fakeRemote();
    const remoteRow = {
      id: 'p1', owner_id: 'user-1', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
      deleted_at: null, name: 'Anna', archived: false,
    };
    await r.client.upsert('players', [remoteRow]);
    const res = await pull(r.client);
    expect(res).toEqual({ pulled: 1, error: null });
    expect((await db.players.get('p1'))!.name).toBe('Anna');
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the local row when it is newer', async () => {
    const local = await addPlayer('Anna lokal');
    await db.outbox.clear();
    const r = fakeRemote();
    await r.client.upsert('players', [{ ...local, name: 'Anna gammel', updated_at: '2000-01-01T00:00:00.000Z' } as BaseRow]);
    await pull(r.client);
    expect((await db.players.get(local.id))!.name).toBe('Anna lokal');
  });

  it('remembers how far it has pulled', async () => {
    const r = fakeRemote();
    await r.client.upsert('players', [{
      id: 'p1', owner_id: 'user-1', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z', deleted_at: null,
    }]);
    await pull(r.client);
    expect((await db.meta.get('pulled_at:players'))!.value).toBe('2026-10-01T10:00:00.000Z');
  });
});
