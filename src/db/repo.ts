import { db, type BaseRow, type TableName } from './schema';

export const nowIso = () => new Date().toISOString();

export function base(): BaseRow {
  const t = nowIso();
  return { id: crypto.randomUUID(), owner_id: null, created_at: t, updated_at: t, deleted_at: null };
}

/** The only write path for synced tables: stamps updated_at and queues the row for sync. */
export async function save<T extends BaseRow>(table: TableName, rows: T | T[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  const t = nowIso();
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    for (const row of list) {
      await db.table(table).put({ ...row, updated_at: t });
      await db.outbox.add({ table, row_id: row.id });
    }
  });
}
