import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/schema';
import { addPlayer, ensureBuiltInGames, finishSession, saveRound, startSession, abandonSession } from '../../src/db/actions';
import { loadExportRows, loadResultRows, loadSessionSummaries } from '../../src/db/queries';

const FIVE_HUNDRED = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

async function playedGame() {
  const a = await addPlayer('Anna');
  const b = await addPlayer('Bo');
  const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
  await saveRound(id, 1, [{ playerId: a.id, points: 520 }, { playerId: b.id, points: 40 }]);
  await finishSession(id);
  return { a, b, id };
}

describe('queries', () => {
  it('summarises sessions with names and winners', async () => {
    await playedGame();
    const [s] = await loadSessionSummaries();
    expect(s).toMatchObject({ gameName: '500', players: ['Anna', 'Bo'], winners: ['Anna'] });
  });

  it('returns result rows only for finished sessions', async () => {
    const { a, b } = await playedGame();
    const id2 = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await abandonSession(id2);
    const rows = await loadResultRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.playerId === a.id)).toMatchObject({ isWinner: true, finalScore: 520, placement: 1 });
  });

  it('builds export rows in the v_results shape', async () => {
    await playedGame();
    const { results, entries } = await loadExportRows();
    expect(results[0]).toMatchObject({ game_name: '500', player_name: 'Anna', placement: 1, is_winner: true, player_count: 2 });
    expect(entries).toHaveLength(2);
  });
});
