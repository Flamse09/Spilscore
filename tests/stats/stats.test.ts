import { describe, expect, it } from 'vitest';
import {
  favoriteGame, headToHead, longestWinStreak, maxRoundScore, scoreSummary, summarize, type ResultRow,
} from '../../src/stats/stats';

const row = (sessionId: string, gameId: string, playerId: string, endedAt: string, placement: number, finalScore: number | null = null): ResultRow => ({
  sessionId, gameId, playerId, endedAt, placement, finalScore, isWinner: placement === 1,
});

const rows: ResultRow[] = [
  row('s1', 'g1', 'A', '2026-01-01', 1, 300), row('s1', 'g1', 'B', '2026-01-01', 2, 200),
  row('s2', 'g1', 'A', '2026-01-02', 2, 100), row('s2', 'g1', 'B', '2026-01-02', 1, 500),
  row('s3', 'g1', 'A', '2026-01-03', 1, 400), row('s3', 'g1', 'B', '2026-01-03', 2, 250), row('s3', 'g1', 'C', '2026-01-03', 3, 50),
  row('s4', 'g2', 'A', '2026-01-04', 1), row('s4', 'g2', 'B', '2026-01-04', 1),
];

describe('summarize', () => {
  it('counts games, wins (shared wins count) and win rate', () => {
    expect(summarize(rows)).toEqual([
      { playerId: 'A', played: 4, wins: 3, winRate: 0.75 },
      { playerId: 'B', played: 4, wins: 2, winRate: 0.5 },
      { playerId: 'C', played: 1, wins: 0, winRate: 0 },
    ]);
  });
});

describe('longestWinStreak', () => {
  it('follows the chronological order of the player own games', () => {
    expect(longestWinStreak(rows, 'A')).toBe(2);
    expect(longestWinStreak(rows, 'C')).toBe(0);
  });
});

describe('headToHead', () => {
  it('compares placements in shared games; ties count for nobody', () => {
    expect(headToHead(rows, 'A', 'B')).toEqual({ games: 4, aWins: 2, bWins: 1 });
    expect(headToHead(rows, 'A', 'C')).toEqual({ games: 1, aWins: 1, bWins: 0 });
  });
});

describe('scoreSummary', () => {
  const g1 = rows.filter((r) => r.gameId === 'g1');
  it('uses high as best for high-scoring games', () => {
    expect(scoreSummary(g1, 'high')).toEqual({ avg: 1800 / 7, best: 500, worst: 50 });
  });
  it('flips best/worst for low-scoring games', () => {
    expect(scoreSummary(g1, 'low')).toMatchObject({ best: 50, worst: 500 });
  });
  it('returns nulls when there are no scores', () => {
    expect(scoreSummary(rows.filter((r) => r.gameId === 'g2'), 'high')).toEqual({ avg: null, best: null, worst: null });
  });
});

describe('favoriteGame', () => {
  it('returns the most played game', () => {
    expect(favoriteGame(rows, 'A')).toBe('g1');
    expect(favoriteGame(rows, 'nobody')).toBeNull();
  });
});

describe('maxRoundScore', () => {
  it('finds the highest single entry', () => {
    expect(maxRoundScore([{ player_id: 'A', points: 40 }, { player_id: 'B', points: 95 }])).toEqual({ playerId: 'B', points: 95 });
    expect(maxRoundScore([])).toBeNull();
  });
});
