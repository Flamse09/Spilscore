import { BUILT_IN_GAMES } from '../games/builtins';
import { computeResults } from '../games/results';
import type { GameDef, Scoring, TeamMode } from '../games/types';
import { base, nowIso, save } from './repo';
import {
  db, type GameRow, type PlayerRow, type ScoreEntryRow, type SessionPlayerRow, type SessionRow, type TeamRow,
} from './schema';

const BUILT_IN_STAMP = '2026-10-09T00:00:00.000Z';
const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export function gameDef(row: GameRow): GameDef {
  if (row.built_in) {
    const def = BUILT_IN_GAMES.find((g) => g.key === row.key);
    if (def) return def;
  }
  return { id: row.id, key: row.key, name: row.name, type: row.type, config: row.config };
}

export async function ensureBuiltInGames(): Promise<void> {
  await db.games.bulkPut(
    BUILT_IN_GAMES.map((g) => ({
      id: g.id, owner_id: null, created_at: BUILT_IN_STAMP, updated_at: BUILT_IN_STAMP, deleted_at: null,
      key: g.key, name: g.name, type: g.type, config: g.config, built_in: true,
    })),
  );
}

export async function addPlayer(name: string): Promise<PlayerRow> {
  const row: PlayerRow = { ...base(), name: name.trim(), archived: false };
  await save('players', row);
  return row;
}

export async function updatePlayer(row: PlayerRow, patch: Partial<Pick<PlayerRow, 'name' | 'archived'>>): Promise<void> {
  await save('players', { ...row, ...patch });
}

export interface SeatInput {
  playerId: string;
  teamIndex: number | null;
}

export async function startSession(
  gameId: string,
  options: Record<string, number>,
  seats: SeatInput[],
  teamNames: string[],
): Promise<string> {
  const session: SessionRow = {
    ...base(), game_id: gameId, options, started_at: nowIso(), ended_at: null, status: 'in_progress', note: null,
  };
  const teams: TeamRow[] = teamNames.map((name, i) => ({ ...base(), session_id: session.id, name, seat: i }));
  const players: SessionPlayerRow[] = seats.map((s, i) => ({
    ...base(), session_id: session.id, player_id: s.playerId,
    team_id: s.teamIndex === null ? null : teams[s.teamIndex].id,
    seat: i, final_score: null, placement: null, is_winner: null,
  }));
  await save('sessions', session);
  if (teams.length) await save('session_teams', teams);
  await save('session_players', players);
  return session.id;
}

export type SeatView = SessionPlayerRow & { name: string };

export interface SessionBundle {
  session: SessionRow;
  game: GameDef;
  seats: SeatView[];
  teams: TeamRow[];
  entries: ScoreEntryRow[];
}

export async function loadSessionBundle(id: string): Promise<SessionBundle | null> {
  const session = await db.sessions.get(id);
  if (!session || session.deleted_at) return null;
  const gameRow = await db.games.get(session.game_id);
  if (!gameRow) return null;
  const [seats, teams, entries, players] = await Promise.all([
    db.session_players.where('session_id').equals(id).toArray(),
    db.session_teams.where('session_id').equals(id).toArray(),
    db.score_entries.where('session_id').equals(id).toArray(),
    db.players.toArray(),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  return {
    session,
    game: gameDef(gameRow),
    seats: seats.filter(live).sort((a, b) => a.seat - b.seat).map((s) => ({ ...s, name: names.get(s.player_id) ?? '?' })),
    teams: teams.filter(live).sort((a, b) => a.seat - b.seat),
    entries: entries.filter(live).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

async function liveEntries(sessionId: string): Promise<ScoreEntryRow[]> {
  return (await db.score_entries.where('session_id').equals(sessionId).toArray()).filter(live);
}

async function refreshIfFinished(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s?.status === 'finished') await finishSession(sessionId);
}

export async function saveRound(
  sessionId: string,
  roundNo: number,
  points: { playerId: string; points: number }[],
  category: string | null = null,
): Promise<void> {
  const existing = (await liveEntries(sessionId)).filter((e) => e.round_no === roundNo);
  const rows: ScoreEntryRow[] = points.map((p) => {
    const old = existing.find((e) => e.player_id === p.playerId);
    return old
      ? { ...old, points: p.points, category }
      : { ...base(), session_id: sessionId, player_id: p.playerId, team_id: null, round_no: roundNo, category, points: p.points };
  });
  await save('score_entries', rows);
  await refreshIfFinished(sessionId);
}

export async function undoLastRound(sessionId: string): Promise<void> {
  const entries = (await liveEntries(sessionId)).filter((e) => e.round_no !== null);
  const last = Math.max(0, ...entries.map((e) => e.round_no!));
  const t = nowIso();
  const rows = entries.filter((e) => e.round_no === last).map((e) => ({ ...e, deleted_at: t }));
  if (rows.length) await save('score_entries', rows);
  await refreshIfFinished(sessionId);
}

export async function setSheetValue(sessionId: string, playerId: string, category: string, points: number | null): Promise<void> {
  const old = (await liveEntries(sessionId)).find((e) => e.player_id === playerId && e.category === category);
  if (points === null) {
    if (old) await save('score_entries', { ...old, deleted_at: nowIso() });
  } else {
    await save(
      'score_entries',
      old
        ? { ...old, points }
        : { ...base(), session_id: sessionId, player_id: playerId, team_id: null, round_no: null, category, points },
    );
  }
  await refreshIfFinished(sessionId);
}

export async function undoLastSheetEntry(sessionId: string): Promise<void> {
  const entries = await liveEntries(sessionId);
  const last = entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (last) await save('score_entries', { ...last, deleted_at: nowIso() });
  await refreshIfFinished(sessionId);
}

export interface ResultInput {
  participantId: string;
  isTeam: boolean;
  placement: number;
  points: number | null;
}

export async function saveResult(sessionId: string, results: ResultInput[]): Promise<void> {
  const existing = (await liveEntries(sessionId)).filter((e) => e.category === 'result');
  const t = nowIso();
  const rows: ScoreEntryRow[] = [];
  for (const r of results) {
    const old = existing.find((e) => (r.isTeam ? e.team_id : e.player_id) === r.participantId);
    if (r.points === null) {
      if (old) rows.push({ ...old, deleted_at: t });
      continue;
    }
    rows.push(
      old
        ? { ...old, points: r.points }
        : {
            ...base(), session_id: sessionId, player_id: r.isTeam ? null : r.participantId,
            team_id: r.isTeam ? r.participantId : null, round_no: null, category: 'result', points: r.points,
          },
    );
  }
  if (rows.length) await save('score_entries', rows);
  await finishSession(sessionId, new Map(results.map((r) => [r.participantId, r.placement])));
}

function storedPlacements(b: SessionBundle): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of b.seats) if (s.placement !== null) m.set(s.team_id ?? s.player_id, s.placement);
  return m;
}

export async function finishSession(sessionId: string, manual?: Map<string, number>): Promise<void> {
  const b = await loadSessionBundle(sessionId);
  if (!b) return;
  const results = computeResults(b.game, b.session.options, b.seats, b.entries, manual ?? storedPlacements(b));
  const seatRows: SessionPlayerRow[] = b.seats.map(({ name, ...seat }) => {
    const r = results.find((x) => x.player_id === seat.player_id)!;
    return { ...seat, final_score: r.final_score, placement: r.placement, is_winner: r.is_winner };
  });
  await save('session_players', seatRows);
  await save('sessions', { ...b.session, status: 'finished', ended_at: b.session.ended_at ?? nowIso() });
}

export async function abandonSession(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, status: 'abandoned', ended_at: nowIso() });
}

export async function setNote(sessionId: string, note: string | null): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, note: note?.trim() || null });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, deleted_at: nowIso() });
}

export async function addCustomGame(
  name: string,
  opts: { teams: TeamMode; trackScore: boolean; scoring: Scoring },
): Promise<GameRow> {
  const row: GameRow = {
    ...base(),
    key: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    type: 'result_only',
    config: { scoring: opts.scoring, minPlayers: 1, teams: opts.teams, trackScore: opts.trackScore },
    built_in: false,
  };
  await save('games', row);
  return row;
}
