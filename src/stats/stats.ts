import type { Scoring } from '../games/types';

export interface ResultRow {
  sessionId: string;
  gameId: string;
  playerId: string;
  endedAt: string;
  finalScore: number | null;
  placement: number | null;
  isWinner: boolean;
}

export interface PlayerSummary {
  playerId: string;
  played: number;
  wins: number;
  winRate: number;
}

export function summarize(rows: ResultRow[]): PlayerSummary[] {
  const by = new Map<string, { played: number; wins: number }>();
  for (const r of rows) {
    const s = by.get(r.playerId) ?? { played: 0, wins: 0 };
    s.played++;
    if (r.isWinner) s.wins++;
    by.set(r.playerId, s);
  }
  return [...by.entries()]
    .map(([playerId, s]) => ({ playerId, ...s, winRate: s.played ? s.wins / s.played : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played);
}

export function longestWinStreak(rows: ResultRow[], playerId: string): number {
  const own = rows.filter((r) => r.playerId === playerId).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  let best = 0;
  let current = 0;
  for (const r of own) {
    current = r.isWinner ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function headToHead(rows: ResultRow[], a: string, b: string): { games: number; aWins: number; bWins: number } {
  const bySession = new Map<string, { a?: ResultRow; b?: ResultRow }>();
  for (const r of rows) {
    if (r.playerId !== a && r.playerId !== b) continue;
    const s = bySession.get(r.sessionId) ?? {};
    if (r.playerId === a) s.a = r;
    else s.b = r;
    bySession.set(r.sessionId, s);
  }
  let games = 0;
  let aWins = 0;
  let bWins = 0;
  for (const { a: ra, b: rb } of bySession.values()) {
    if (!ra || !rb || ra.placement === null || rb.placement === null) continue;
    games++;
    if (ra.placement < rb.placement) aWins++;
    else if (rb.placement < ra.placement) bWins++;
  }
  return { games, aWins, bWins };
}

export function scoreSummary(rows: ResultRow[], scoring: Scoring): { avg: number | null; best: number | null; worst: number | null } {
  const scores = rows.map((r) => r.finalScore).filter((s): s is number => s !== null);
  if (!scores.length) return { avg: null, best: null, worst: null };
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return {
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    best: scoring === 'high' ? max : min,
    worst: scoring === 'high' ? min : max,
  };
}

export function favoriteGame(rows: ResultRow[], playerId: string): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.playerId === playerId) counts.set(r.gameId, (counts.get(r.gameId) ?? 0) + 1);
  let best: string | null = null;
  for (const [g, n] of counts) if (best === null || n > counts.get(best)!) best = g;
  return best;
}

export function maxRoundScore(entries: { player_id: string | null; points: number }[]): { playerId: string; points: number } | null {
  let best: { playerId: string; points: number } | null = null;
  for (const e of entries) {
    if (e.player_id && (!best || e.points > best.points)) best = { playerId: e.player_id, points: e.points };
  }
  return best;
}
