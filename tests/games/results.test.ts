import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { computeResults, isGameOver, type EntryLike, type SeatLike } from '../../src/games/results';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;
const seats = (...ids: string[]): SeatLike[] => ids.map((player_id) => ({ player_id, team_id: null }));
const round = (round_no: number, pts: Record<string, number>, category: string | null = null): EntryLike[] =>
  Object.entries(pts).map(([player_id, points]) => ({ player_id, team_id: null, round_no, category, points }));

describe('open rounds (500)', () => {
  const entries = [...round(1, { a: 300, b: 400 }), ...round(2, { a: 250, b: 90 })];

  it('ranks by total, highest wins', () => {
    const r = computeResults(game('500'), {}, seats('a', 'b'), entries);
    expect(r).toEqual([
      { player_id: 'a', final_score: 550, placement: 1, is_winner: true },
      { player_id: 'b', final_score: 490, placement: 2, is_winner: false },
    ]);
  });

  it('is over once someone reaches the target', () => {
    expect(isGameOver(game('500'), {}, seats('a', 'b'), entries)).toBe(true);
    expect(isGameOver(game('500'), {}, seats('a', 'b'), round(1, { a: 499, b: 0 }))).toBe(false);
  });

  it('Flip 7 is not over at 190', () => {
    expect(isGameOver(game('flip7'), {}, seats('a', 'b', 'c'), round(1, { a: 190, b: 0, c: 5 }))).toBe(false);
  });
});

describe('fixed rounds (Davoserjas)', () => {
  const keys = ['tricks', 'clubs', 'queens', 'kingOfClubs', 'firstLast', 'all', 'kabale'];
  const six = keys.slice(0, 6).flatMap((k, i) => round(i + 1, { a: 2, b: 5, c: 9 }, k));

  it('is not over after six rounds', () => {
    expect(isGameOver(game('davoserjas'), {}, seats('a', 'b', 'c'), six)).toBe(false);
  });

  it('is over after the seventh round (Kabalen) and lowest wins', () => {
    const all = [...six, ...round(7, { a: 0, b: 3, c: 4 }, 'kabale')];
    expect(isGameOver(game('davoserjas'), {}, seats('a', 'b', 'c'), all)).toBe(true);
    const r = computeResults(game('davoserjas'), {}, seats('a', 'b', 'c'), all);
    expect(r.find((x) => x.is_winner)!.player_id).toBe('a');
    expect(r.find((x) => x.player_id === 'a')!.final_score).toBe(12);
  });
});

describe('scoresheet (Yatzy)', () => {
  it('uses the sheet total including bonus', () => {
    const filled = { n1: 3, n2: 6, n3: 9, n4: 12, n5: 15, n6: 18, chance: 20 };
    const entries: EntryLike[] = Object.entries(filled).map(([category, points]) => ({
      player_id: 'a', team_id: null, round_no: null, category, points,
    }));
    const r = computeResults(game('yatzy'), { dice: 5 }, seats('a'), entries);
    expect(r[0].final_score).toBe(133);
  });

  it('is over only when every field is filled for every player', () => {
    expect(isGameOver(game('yatzy'), { dice: 5 }, seats('a'), [
      { player_id: 'a', team_id: null, round_no: null, category: 'n1', points: 3 },
    ])).toBe(false);
  });
});

describe('result only (Hitster with teams)', () => {
  const s: SeatLike[] = [
    { player_id: 'a', team_id: 't1' },
    { player_id: 'b', team_id: 't1' },
    { player_id: 'c', team_id: 't2' },
  ];

  it('copies the team placement to each member and sums team points', () => {
    const entries: EntryLike[] = [{ player_id: null, team_id: 't1', round_no: null, category: 'result', points: 10 }];
    const r = computeResults(game('hitster'), {}, s, entries, new Map([['t1', 1], ['t2', 2]]));
    expect(r).toEqual([
      { player_id: 'a', final_score: 10, placement: 1, is_winner: true },
      { player_id: 'b', final_score: 10, placement: 1, is_winner: true },
      { player_id: 'c', final_score: null, placement: 2, is_winner: false },
    ]);
  });

  it('is never auto-finished', () => {
    expect(isGameOver(game('hitster'), {}, s, [])).toBe(false);
  });
});
