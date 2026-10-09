import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { computeRecords, type RecordEntry, type RecordInput } from '../../src/stats/records';
import type { ResultRow } from '../../src/stats/stats';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;
const res = (sessionId: string, playerId: string, endedAt: string, placement: number, finalScore: number | null): ResultRow => ({
  sessionId, gameId: 'g', playerId, endedAt, placement, finalScore, isWinner: placement === 1,
});
const entry = (sessionId: string, playerId: string, roundNo: number | null, points: number, category: string | null = null): RecordEntry => ({
  sessionId, playerId, roundNo, category, points,
});
const byKey = (input: RecordInput, key: string) => computeRecords(game(key), input);
const rec = (list: ReturnType<typeof computeRecords>, k: string) => list.find((r) => r.key === k);

describe('500 records', () => {
  // s1: A wins in 3 rounds; s2: B wins in 2 rounds with a 300-point round; s3: A wins in 2 rounds, later.
  const input: RecordInput = {
    results: [
      res('s1', 'A', '2026-10-01', 1, 520), res('s1', 'B', '2026-10-01', 2, 300),
      res('s2', 'A', '2026-10-02', 2, 100), res('s2', 'B', '2026-10-02', 1, 510),
      res('s3', 'A', '2026-10-03', 1, 505), res('s3', 'B', '2026-10-03', 2, 50),
    ],
    entries: [
      entry('s1', 'A', 1, 200), entry('s1', 'A', 2, 200), entry('s1', 'A', 3, 120),
      entry('s2', 'B', 1, 210), entry('s2', 'B', 2, 300),
      entry('s3', 'A', 1, 250), entry('s3', 'A', 2, 255),
    ],
  };
  const list = byKey(input, '500');

  it('best final score is the highest, first achiever wins ties', () => {
    expect(rec(list, 'best-score')).toMatchObject({ value: '520', holders: ['A'], sessionId: 's1' });
  });

  it('fastest win counts rounds; the earliest of equal records holds it', () => {
    expect(rec(list, 'fastest-win')).toMatchObject({ value: '2 runder', holders: ['B'], sessionId: 's2' });
  });

  it('best single round', () => {
    expect(rec(list, 'best-round')).toMatchObject({ value: '300', holders: ['B'], sessionId: 's2' });
  });

  it('most wins and longest streak', () => {
    expect(rec(list, 'most-wins')).toMatchObject({ value: '2 sejre', holders: ['A'] });
    expect(rec(list, 'streak')).toMatchObject({ value: '1 i træk' });
  });
});

describe('low-scoring records (Davoserjas)', () => {
  it('best final score is the lowest', () => {
    const list = byKey({ results: [res('s1', 'A', '2026-10-01', 1, 40), res('s1', 'B', '2026-10-01', 2, 70)], entries: [] }, 'davoserjas');
    expect(rec(list, 'best-score')).toMatchObject({ title: 'Laveste slutscore', value: '40', holders: ['A'] });
    expect(rec(list, 'fastest-win')).toBeUndefined();
    expect(rec(list, 'best-round')).toBeUndefined();
  });
});

describe('game-specific records', () => {
  it('counts yatzyer in Yatzy', () => {
    const list = byKey({
      results: [res('s1', 'A', '2026-10-01', 1, 250)],
      entries: [entry('s1', 'A', null, 50, 'yatzy'), entry('s1', 'B', null, 0, 'yatzy')],
    }, 'yatzy');
    expect(rec(list, 'yatzy-count')).toMatchObject({ title: 'Flest yatzyer', value: '1', holders: ['A'] });
  });

  it('counts holes in one in Minigolf', () => {
    const list = byKey({
      results: [res('s1', 'A', '2026-10-01', 1, 30)],
      entries: [entry('s1', 'A', 1, 1), entry('s1', 'A', 2, 1), entry('s1', 'B', 1, 1), entry('s1', 'B', 2, 3)],
    }, 'minigolf');
    expect(rec(list, 'hole-in-one')).toMatchObject({ value: '2', holders: ['A'] });
  });
});

describe('empty input', () => {
  it('returns no records', () => {
    expect(byKey({ results: [], entries: [] }, '500')).toEqual([]);
  });
});
