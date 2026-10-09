import { rank } from './placement';
import type { GameDef } from './types';
import { yatzyCategories, yatzyTotals, type Dice } from './yatzy';

export interface SeatLike {
  player_id: string;
  team_id: string | null;
}

export interface EntryLike {
  player_id: string | null;
  team_id: string | null;
  round_no: number | null;
  category: string | null;
  points: number;
}

export interface PlayerResult {
  player_id: string;
  final_score: number | null;
  placement: number;
  is_winner: boolean;
}

export function participantOf(x: { player_id: string | null; team_id: string | null }): string {
  return (x.team_id ?? x.player_id)!;
}

export function diceOf(options: Record<string, number>): Dice {
  return options.dice === 6 ? 6 : 5;
}

function usesTeams(game: GameDef, seats: SeatLike[]): boolean {
  return game.config.teams !== 'none' && seats.some((s) => s.team_id !== null);
}

function sumByParticipant(entries: EntryLike[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const e of entries) sums.set(participantOf(e), (sums.get(participantOf(e)) ?? 0) + e.points);
  return sums;
}

function filledFor(entries: EntryLike[], participant: string): Record<string, number> {
  const filled: Record<string, number> = {};
  for (const e of entries) if (e.category && participantOf(e) === participant) filled[e.category] = e.points;
  return filled;
}

export function computeResults(
  game: GameDef,
  options: Record<string, number>,
  seats: SeatLike[],
  entries: EntryLike[],
  manual?: Map<string, number>,
): PlayerResult[] {
  const teams = usesTeams(game, seats);
  const key = (s: SeatLike) => (teams ? s.team_id! : s.player_id);
  const participants = [...new Set(seats.map(key))];
  const sums = sumByParticipant(entries);
  const byParticipant = new Map<string, { total: number | null; placement: number }>();

  if (game.type === 'result_only') {
    for (const p of participants) {
      byParticipant.set(p, { total: sums.get(p) ?? null, placement: manual?.get(p) ?? participants.length });
    }
  } else {
    const standings = participants.map((id) => ({
      id,
      total: game.type === 'scoresheet' ? yatzyTotals(diceOf(options), filledFor(entries, id)).total : sums.get(id) ?? 0,
    }));
    for (const r of rank(standings, game.config.scoring)) byParticipant.set(r.id, { total: r.total, placement: r.placement });
  }

  return seats.map((s) => {
    const r = byParticipant.get(key(s))!;
    return { player_id: s.player_id, final_score: r.total, placement: r.placement, is_winner: r.placement === 1 };
  });
}

export function isGameOver(
  game: GameDef,
  options: Record<string, number>,
  seats: SeatLike[],
  entries: EntryLike[],
): boolean {
  const ids = seats.map((s) => s.player_id);
  switch (game.type) {
    case 'open_rounds': {
      const target = game.config.target;
      if (target === undefined) return false;
      return [...sumByParticipant(entries).values()].some((t) => t >= target);
    }
    case 'fixed_rounds': {
      const n = game.config.rounds?.length ?? 0;
      return ids.every(
        (id) => new Set(entries.filter((e) => e.player_id === id && e.round_no !== null).map((e) => e.round_no)).size >= n,
      );
    }
    case 'scoresheet': {
      const cats = yatzyCategories(diceOf(options));
      return ids.every((id) => cats.every((c) => entries.some((e) => e.player_id === id && e.category === c.key)));
    }
    case 'result_only':
      return false;
  }
}
