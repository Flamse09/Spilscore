import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { computeResults, isGameOver, roundsFor, type EntryLike, type SeatLike } from '../../src/games/results';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;
const seats = (...ids: string[]): SeatLike[] => ids.map((player_id) => ({ player_id, team_id: null }));
const rounds = (n: number, pts: Record<string, number>): EntryLike[] =>
  Array.from({ length: n }, (_, i) =>
    Object.entries(pts).map(([player_id, points]) => ({ player_id, team_id: null, round_no: i + 1, category: null, points })),
  ).flat();

describe('minigolf', () => {
  it('has one round per hole from the chosen option', () => {
    expect(roundsFor(game('minigolf'), { holes: 9 })!.map((r) => r.label)).toEqual(
      ['Hul 1', 'Hul 2', 'Hul 3', 'Hul 4', 'Hul 5', 'Hul 6', 'Hul 7', 'Hul 8', 'Hul 9'],
    );
    expect(roundsFor(game('minigolf'), {})).toHaveLength(18);
  });

  it('ends after the last hole and fewest strokes wins', () => {
    const s = seats('a', 'b');
    expect(isGameOver(game('minigolf'), { holes: 9 }, s, rounds(8, { a: 2, b: 3 }))).toBe(false);
    const all = rounds(9, { a: 2, b: 3 });
    expect(isGameOver(game('minigolf'), { holes: 9 }, s, all)).toBe(true);
    expect(computeResults(game('minigolf'), { holes: 9 }, s, all).find((r) => r.is_winner)!.player_id).toBe('a');
  });
});

describe('mexican train', () => {
  it('runs 13 rounds from double 12 to double 0, lowest wins', () => {
    const r = roundsFor(game('mexicantrain'), {})!;
    expect(r).toHaveLength(13);
    expect(r[0].label).toBe('Dobbelt 12');
    expect(r[12].label).toBe('Dobbelt 0');
    expect(game('mexicantrain').config.scoring).toBe('low');
  });
});

describe('uno', () => {
  it('is first to 500, highest wins', () => {
    const s = seats('a', 'b');
    expect(isGameOver(game('uno'), {}, s, rounds(1, { a: 480, b: 0 }))).toBe(false);
    expect(isGameOver(game('uno'), {}, s, rounds(1, { a: 510, b: 0 }))).toBe(true);
  });
});
