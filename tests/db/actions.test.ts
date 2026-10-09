import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/schema';
import {
  addPlayer, ensureBuiltInGames, finishSession, loadSessionBundle, saveResult, saveRound,
  setSheetValue, startSession, undoLastRound, deleteSession, addCustomGame,
} from '../../src/db/actions';

const FIVE_HUNDRED = '00000000-0000-4000-8000-000000000002';
const YATZY = '00000000-0000-4000-8000-000000000001';
const HITSTER = '00000000-0000-4000-8000-000000000005';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

async function twoPlayers() {
  const a = await addPlayer('Anna');
  const b = await addPlayer('Bo');
  return [a, b];
}

describe('players', () => {
  it('trims names and queues the row in the outbox', async () => {
    const p = await addPlayer('  Anna ');
    expect(p.name).toBe('Anna');
    expect(await db.outbox.where('row_id').equals(p.id).count()).toBe(1);
  });
});

describe('built-in games', () => {
  it('are seeded without outbox entries', async () => {
    expect(await db.games.count()).toBe(5);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('sessions', () => {
  it('creates a session with seats in order', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: b.id, teamIndex: null }, { playerId: a.id, teamIndex: null }], []);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('in_progress');
    expect(bundle.seats.map((s) => s.name)).toEqual(['Bo', 'Anna']);
    expect(bundle.game.key).toBe('500');
  });

  it('updates an existing round instead of duplicating it', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 10 }, { playerId: b.id, points: 20 }]);
    await saveRound(id, 1, [{ playerId: a.id, points: 15 }, { playerId: b.id, points: 20 }]);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.entries.find((e) => e.player_id === a.id)!.points).toBe(15);
  });

  it('concurrent saves of the same new round leave one entry per player', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    const pts = [{ playerId: a.id, points: 10 }, { playerId: b.id, points: 20 }];
    await Promise.all([saveRound(id, 1, pts), saveRound(id, 1, pts)]);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.entries).toHaveLength(2);
  });

  it('undo removes the whole last round', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 10 }, { playerId: b.id, points: 20 }]);
    await saveRound(id, 2, [{ playerId: a.id, points: 5 }, { playerId: b.id, points: 5 }]);
    await undoLastRound(id);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.entries.map((e) => e.round_no)).toEqual([1, 1]);
  });

  it('finishSession writes placements and recomputes after later edits', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 500 }, { playerId: b.id, points: 100 }]);
    await finishSession(id);
    let bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('finished');
    expect(bundle.seats.find((s) => s.player_id === a.id)).toMatchObject({ final_score: 500, placement: 1, is_winner: true });

    await saveRound(id, 1, [{ playerId: a.id, points: 50 }, { playerId: b.id, points: 600 }]);
    bundle = (await loadSessionBundle(id))!;
    expect(bundle.seats.find((s) => s.player_id === b.id)).toMatchObject({ final_score: 600, is_winner: true });
  });

  it('setSheetValue sets, overwrites and clears a Yatzy cell', async () => {
    const [a] = await twoPlayers();
    const id = await startSession(YATZY, { dice: 5 }, [{ playerId: a.id, teamIndex: null }], []);
    await setSheetValue(id, a.id, 'n3', 9);
    await setSheetValue(id, a.id, 'n3', 12);
    expect((await loadSessionBundle(id))!.entries.map((e) => e.points)).toEqual([12]);
    await setSheetValue(id, a.id, 'n3', null);
    expect((await loadSessionBundle(id))!.entries).toHaveLength(0);
  });

  it('saveResult stores team points and placements', async () => {
    const [a, b] = await twoPlayers();
    const c = await addPlayer('Cille');
    const id = await startSession(HITSTER, {}, [
      { playerId: a.id, teamIndex: 0 }, { playerId: b.id, teamIndex: 0 }, { playerId: c.id, teamIndex: 1 },
    ], ['Hold 1', 'Hold 2']);
    const teams = (await loadSessionBundle(id))!.teams;
    await saveResult(id, [
      { participantId: teams[0].id, isTeam: true, placement: 2, points: 7 },
      { participantId: teams[1].id, isTeam: true, placement: 1, points: 10 },
    ]);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('finished');
    expect(bundle.seats.find((s) => s.player_id === c.id)).toMatchObject({ placement: 1, is_winner: true, final_score: 10 });
    expect(bundle.seats.find((s) => s.player_id === a.id)).toMatchObject({ placement: 2, final_score: 7 });
  });

  it('deleteSession hides the session', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await deleteSession(id);
    expect(await loadSessionBundle(id)).toBeNull();
  });
});

describe('custom games', () => {
  it('creates a synced result-only game', async () => {
    const g = await addCustomGame('Codenames', { teams: 'required', trackScore: false, scoring: 'high' });
    expect(g).toMatchObject({ type: 'result_only', built_in: false, name: 'Codenames' });
    expect(await db.outbox.where('row_id').equals(g.id).count()).toBe(1);
  });
});
