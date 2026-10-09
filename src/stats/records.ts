import type { GameDef } from '../games/types';
import { longestWinStreak, type ResultRow } from './stats';

export interface RecordEntry {
  sessionId: string;
  playerId: string | null;
  roundNo: number | null;
  category: string | null;
  points: number;
}

/** Finished games of one game type: their results and score entries. */
export interface RecordInput {
  results: ResultRow[];
  entries: RecordEntry[];
}

export interface GameRecord {
  key: string;
  title: string;
  value: string;
  /** Player ids. Single-game records have one holder; count records list everyone tied. */
  holders: string[];
  /** The game that set the record, for single-game records. */
  sessionId: string | null;
  date: string | null;
}

const fmt = (n: number) => n.toLocaleString('da-DK');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Best item by score; on a tie the earliest achiever keeps the record. */
function bestOf<T>(items: T[], score: (t: T) => number, better: (a: number, b: number) => boolean, date: (t: T) => string): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (best === undefined) {
      best = item;
      continue;
    }
    const a = score(item);
    const b = score(best);
    if (better(a, b) || (a === b && date(item) < date(best))) best = item;
  }
  return best;
}

function topCount(counts: Map<string, number>): { n: number; holders: string[] } | null {
  const n = Math.max(0, ...counts.values());
  if (n <= 0) return null;
  return { n, holders: [...counts].filter(([, v]) => v === n).map(([k]) => k).sort() };
}

function countBy<T>(items: T[], key: (t: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function computeRecords(game: GameDef, input: RecordInput): GameRecord[] {
  const { results, entries } = input;
  if (!results.length) return [];
  const high = game.config.scoring === 'high';
  const better = (a: number, b: number) => (high ? a > b : a < b);
  const endedOf = new Map(results.map((r) => [r.sessionId, r.endedAt]));
  const out: GameRecord[] = [];

  const best = bestOf(results.filter((r) => r.finalScore !== null), (r) => r.finalScore!, better, (r) => r.endedAt);
  if (best) {
    out.push({
      key: 'best-score', title: high ? 'Højeste slutscore' : 'Laveste slutscore', value: fmt(best.finalScore!),
      holders: [best.playerId], sessionId: best.sessionId, date: best.endedAt,
    });
  }

  if (game.type === 'open_rounds') {
    const roundsBySession = new Map<string, number>();
    for (const e of entries) {
      if (e.roundNo !== null) roundsBySession.set(e.sessionId, Math.max(roundsBySession.get(e.sessionId) ?? 0, e.roundNo));
    }
    const fast = bestOf(
      results.filter((r) => r.isWinner && roundsBySession.has(r.sessionId)),
      (r) => roundsBySession.get(r.sessionId)!,
      (a, b) => a < b,
      (r) => r.endedAt,
    );
    if (fast) {
      out.push({
        key: 'fastest-win', title: 'Hurtigste sejr', value: plural(roundsBySession.get(fast.sessionId)!, 'runde', 'runder'),
        holders: [fast.playerId], sessionId: fast.sessionId, date: fast.endedAt,
      });
    }
    if (high) {
      const top = bestOf(
        entries.filter((e) => e.roundNo !== null && e.playerId !== null),
        (e) => e.points,
        (a, b) => a > b,
        (e) => endedOf.get(e.sessionId) ?? '',
      );
      if (top) {
        out.push({
          key: 'best-round', title: 'Flest point i én runde', value: fmt(top.points),
          holders: [top.playerId!], sessionId: top.sessionId, date: endedOf.get(top.sessionId) ?? null,
        });
      }
    }
  }

  const wins = topCount(countBy(results.filter((r) => r.isWinner), (r) => r.playerId));
  if (wins) {
    out.push({ key: 'most-wins', title: 'Flest sejre', value: plural(wins.n, 'sejr', 'sejre'), holders: wins.holders, sessionId: null, date: null });
  }

  const streaks = new Map([...new Set(results.map((r) => r.playerId))].map((p) => [p, longestWinStreak(results, p)]));
  const streak = topCount(streaks);
  if (streak) {
    out.push({ key: 'streak', title: 'Længste sejrsstime', value: `${streak.n} i træk`, holders: streak.holders, sessionId: null, date: null });
  }

  if (game.key === 'yatzy') {
    const y = topCount(countBy(entries.filter((e) => e.category === 'yatzy' && e.points > 0), (e) => e.playerId));
    if (y) out.push({ key: 'yatzy-count', title: 'Flest yatzyer', value: String(y.n), holders: y.holders, sessionId: null, date: null });
  }

  if (game.key === 'minigolf') {
    const h = topCount(countBy(entries.filter((e) => e.roundNo !== null && e.points === 1), (e) => e.playerId));
    if (h) out.push({ key: 'hole-in-one', title: 'Flest hole-in-one', value: String(h.n), holders: h.holders, sessionId: null, date: null });
  }

  return out;
}
