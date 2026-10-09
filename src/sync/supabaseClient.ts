import { createClient } from '@supabase/supabase-js';
import type { BaseRow } from '../db/schema';
import { PULL_PAGE, type RemoteClient } from './sync';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'started_at', 'ended_at'];
const NUMERIC_COLUMNS = ['points', 'final_score'];

export function normalizeRow(row: Record<string, unknown>): BaseRow {
  const out: Record<string, unknown> = { ...row };
  for (const c of TIMESTAMP_COLUMNS) {
    if (typeof out[c] === 'string') out[c] = new Date(out[c] as string).toISOString();
  }
  for (const c of NUMERIC_COLUMNS) {
    if (typeof out[c] === 'string') out[c] = Number(out[c]);
  }
  return out as unknown as BaseRow;
}

export const remote: RemoteClient = {
  async userId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },
  async upsert(table, rows) {
    const { error } = await supabase.from(table).upsert(rows);
    return error ? error.message : null;
  },
  async fetchSince(table, since) {
    let q = supabase.from(table).select('*').order('updated_at').limit(PULL_PAGE);
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q;
    return { rows: (data ?? []).map(normalizeRow), error: error ? error.message : null };
  },
};
