import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { normalizeRow } = await import('../../src/sync/supabaseClient');

describe('normalizeRow', () => {
  it('rewrites Postgres timestamps to JS ISO strings so string comparison works', () => {
    const row = normalizeRow({
      id: 'x', owner_id: 'u', created_at: '2026-10-09T12:00:00.123+00:00',
      updated_at: '2026-10-09T12:00:00.5+00:00', deleted_at: null, ended_at: null,
    });
    expect(row.created_at).toBe('2026-10-09T12:00:00.123Z');
    expect(row.updated_at).toBe('2026-10-09T12:00:00.500Z');
    expect(row.deleted_at).toBeNull();
  });

  it('turns numeric strings in numeric columns into numbers', () => {
    const row = normalizeRow({ id: 'x', points: '12', final_score: '7.5' }) as unknown as Record<string, unknown>;
    expect(row.points).toBe(12);
    expect(row.final_score).toBe(7.5);
  });
});
