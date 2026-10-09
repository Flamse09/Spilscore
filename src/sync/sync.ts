import { db, SYNC_TABLES, type BaseRow, type TableName } from '../db/schema';

export interface RemoteClient {
  userId(): Promise<string | null>;
  /** Returns an error message, or null on success. */
  upsert(table: TableName, rows: BaseRow[]): Promise<string | null>;
  fetchSince(table: TableName, since: string | null): Promise<{ rows: BaseRow[]; error: string | null }>;
}

export const PULL_PAGE = 1000;

const isBuiltIn = (table: TableName, row: BaseRow) => table === 'games' && (row as BaseRow & { built_in?: boolean }).built_in === true;

export async function push(client: RemoteClient): Promise<{ pushed: number; error: string | null }> {
  const uid = await client.userId();
  if (!uid) return { pushed: 0, error: null };
  const pending = await db.outbox.orderBy('seq').toArray();
  let pushed = 0;
  for (const table of SYNC_TABLES) {
    const items = pending.filter((p) => p.table === table);
    if (!items.length) continue;
    const ids = [...new Set(items.map((i) => i.row_id))];
    const rows = (await db.table(table).bulkGet(ids)).filter((r): r is BaseRow => !!r);
    const toSend = rows.filter((r) => !isBuiltIn(table, r)).map((r) => ({ ...r, owner_id: uid }));
    if (toSend.length) {
      const error = await client.upsert(table, toSend);
      if (error) return { pushed, error };
    }
    await db.transaction('rw', db.outbox, db.table(table), async () => {
      await db.outbox.bulkDelete(items.map((i) => i.seq!));
      for (const r of toSend) await db.table(table).update(r.id, { owner_id: uid });
    });
    pushed += toSend.length;
  }
  return { pushed, error: null };
}

export async function pull(client: RemoteClient): Promise<{ pulled: number; error: string | null }> {
  const uid = await client.userId();
  if (!uid) return { pulled: 0, error: null };
  let pulled = 0;
  for (const table of SYNC_TABLES) {
    const metaKey = `pulled_at:${table}`;
    let since = (await db.meta.get(metaKey))?.value ?? null;
    for (;;) {
      const { rows, error } = await client.fetchSince(table, since);
      if (error) return { pulled, error };
      await db.transaction('rw', db.table(table), async () => {
        for (const remote of rows) {
          if (isBuiltIn(table, remote)) continue;
          const local = (await db.table(table).get(remote.id)) as BaseRow | undefined;
          if (!local || local.updated_at < remote.updated_at) {
            await db.table(table).put(remote);
            pulled++;
          }
        }
      });
      const newest = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), since);
      if (newest) await db.meta.put({ key: metaKey, value: newest });
      if (rows.length < PULL_PAGE || newest === since) break;
      since = newest;
    }
  }
  return { pulled, error: null };
}
