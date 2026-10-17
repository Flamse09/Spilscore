import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, ensureBuiltInGames, finishSession, loadSessionBundle, reopenSession, saveRound, startSession } from '../../src/db/actions';
import { byRecent, loadPlayerActivity } from '../../src/db/queries';
import { db } from '../../src/db/schema';

const FIVE_HUNDRED = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

describe('player activity', () => {
  it('counts finished games and finds the latest start per player', async () => {
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    await addPlayer('Cille');
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 500 }, { playerId: b.id, points: 10 }]);
    await finishSession(id);
    await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);

    const activity = await loadPlayerActivity();
    expect(activity.get(a.id)?.games).toBe(1);
    expect(activity.get(a.id)?.lastPlayed).not.toBeNull();
    expect(activity.get('missing')).toBeUndefined();
  });
});

describe('byRecent', () => {
  it('puts the most recently played first, then never-played alphabetically', () => {
    const players = [
      { id: 'c', name: 'Cille' },
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Bo' },
      { id: 'd', name: 'Ditte' },
    ];
    const activity = new Map([
      ['b', { lastPlayed: '2026-10-01T10:00:00.000Z', games: 3 }],
      ['d', { lastPlayed: '2026-10-08T10:00:00.000Z', games: 1 }],
    ]);
    expect(byRecent(players, activity).map((p) => p.name)).toEqual(['Ditte', 'Bo', 'Anna', 'Cille']);
  });
});

describe('reopenSession', () => {
  it('puts a finished game back in progress and clears the end time', async () => {
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 500 }, { playerId: b.id, points: 10 }]);
    await finishSession(id);
    await reopenSession(id);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('in_progress');
    expect(bundle.session.ended_at).toBeNull();
  });
});

describe('rematch', () => {
  it('starts a new game with the same game, options, seats and teams', async () => {
    const { rematch } = await import('../../src/db/actions');
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    const c = await addPlayer('Cille');
    const id = await startSession('00000000-0000-4000-8000-000000000005', {}, [
      { playerId: b.id, teamIndex: 1 }, { playerId: a.id, teamIndex: 0 }, { playerId: c.id, teamIndex: 0 },
    ], ['Hold 1', 'Hold 2']);
    const newId = await rematch(id);
    expect(newId).not.toBe(id);
    const old = (await loadSessionBundle(id))!;
    const fresh = (await loadSessionBundle(newId))!;
    expect(fresh.session).toMatchObject({ game_id: old.session.game_id, status: 'in_progress' });
    expect(fresh.seats.map((s) => s.player_id)).toEqual([b.id, a.id, c.id]);
    expect(fresh.teams.map((t) => t.name)).toEqual(['Hold 1', 'Hold 2']);
    const teamName = (bundle: typeof fresh, pid: string) => bundle.teams.find((t) => t.id === bundle.seats.find((s) => s.player_id === pid)!.team_id)!.name;
    expect(teamName(fresh, b.id)).toBe('Hold 2');
    expect(teamName(fresh, a.id)).toBe('Hold 1');
  });

  it('keeps options such as the number of dice', async () => {
    const { rematch } = await import('../../src/db/actions');
    const a = await addPlayer('Anna');
    const id = await startSession('00000000-0000-4000-8000-000000000001', { dice: 6 }, [{ playerId: a.id, teamIndex: null }], []);
    const fresh = (await loadSessionBundle(await rematch(id)))!;
    expect(fresh.session.options).toEqual({ dice: 6 });
  });
});

describe('saveTraitorsResult', () => {
  it('stores roles as teams, outcomes as entries, silver as score and the winning side', async () => {
    const { saveTraitorsResult } = await import('../../src/db/actions');
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    const c = await addPlayer('Cille');
    const d = await addPlayer('Ditte');
    const id = await startSession('00000000-0000-4000-8000-000000000009', { traitors: 1 }, [a, b, c, d].map((p) => ({ playerId: p.id, teamIndex: null })), []);
    await saveTraitorsResult(id, [
      { playerId: a.id, role: 'traitor', outcome: 'overlevede', roundOut: null, silver: 3 },
      { playerId: b.id, role: 'loyal', outcome: 'myrdet', roundOut: 1, silver: 0 },
      { playerId: c.id, role: 'loyal', outcome: 'forvist', roundOut: 2, silver: 0 },
      { playerId: d.id, role: 'loyal', outcome: 'overlevede', roundOut: null, silver: 1 },
    ], 'traitor');
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('finished');
    expect(bundle.teams.map((t) => t.name).sort()).toEqual(['Forrædere', 'Trofaste']);
    const seat = (pid: string) => bundle.seats.find((s) => s.player_id === pid)!;
    const team = (pid: string) => bundle.teams.find((t) => t.id === seat(pid).team_id)!.name;
    expect(team(a.id)).toBe('Forrædere');
    expect(team(b.id)).toBe('Trofaste');
    expect(seat(a.id)).toMatchObject({ placement: 1, is_winner: true, final_score: 3 });
    expect(seat(d.id)).toMatchObject({ placement: 2, is_winner: false, final_score: 1 });
    const entry = bundle.entries.find((e) => e.player_id === c.id)!;
    expect(entry).toMatchObject({ category: 'forvist', round_no: 2, points: 0 });
  });

  it('updates instead of duplicating when edited', async () => {
    const { saveTraitorsResult } = await import('../../src/db/actions');
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    const c = await addPlayer('Cille');
    const id = await startSession('00000000-0000-4000-8000-000000000009', { traitors: 1 }, [a, b, c].map((p) => ({ playerId: p.id, teamIndex: null })), []);
    const input = [
      { playerId: a.id, role: 'traitor' as const, outcome: 'forvist' as const, roundOut: 1, silver: 0 },
      { playerId: b.id, role: 'loyal' as const, outcome: 'overlevede' as const, roundOut: null, silver: 2 },
      { playerId: c.id, role: 'loyal' as const, outcome: 'overlevede' as const, roundOut: null, silver: 2 },
    ];
    await saveTraitorsResult(id, input, 'loyal');
    await saveTraitorsResult(id, input, 'loyal');
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.teams).toHaveLength(2);
    expect(bundle.entries).toHaveLength(3);
    expect(bundle.seats.find((s) => s.player_id === b.id)).toMatchObject({ is_winner: true, final_score: 2 });
  });
});
