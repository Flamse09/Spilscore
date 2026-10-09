import type { ResultRow } from '../stats/stats';
import { db, type SessionRow } from './schema';

const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export interface SessionSummary {
  session: SessionRow;
  gameName: string;
  playerIds: string[];
  players: string[];
  winners: string[];
}

export async function loadSessionSummaries(): Promise<SessionSummary[]> {
  const [sessions, games, players, seats] = await Promise.all([
    db.sessions.toArray(), db.games.toArray(), db.players.toArray(), db.session_players.toArray(),
  ]);
  const gameName = new Map(games.map((g) => [g.id, g.name]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  return sessions
    .filter(live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((session) => {
      const ss = seats.filter((x) => x.session_id === session.id && live(x)).sort((a, b) => a.seat - b.seat);
      return {
        session,
        gameName: gameName.get(session.game_id) ?? '?',
        playerIds: ss.map((x) => x.player_id),
        players: ss.map((x) => playerName.get(x.player_id) ?? '?'),
        winners: ss.filter((x) => x.is_winner).map((x) => playerName.get(x.player_id) ?? '?'),
      };
    });
}

export interface PlayerActivity {
  /** Start of the player's most recent non-deleted game, any status. */
  lastPlayed: string | null;
  /** Number of finished games. */
  games: number;
}

export async function loadPlayerActivity(): Promise<Map<string, PlayerActivity>> {
  const [sessions, seats] = await Promise.all([db.sessions.toArray(), db.session_players.toArray()]);
  const liveSessions = new Map(sessions.filter(live).map((s) => [s.id, s]));
  const activity = new Map<string, PlayerActivity>();
  for (const seat of seats) {
    const s = liveSessions.get(seat.session_id);
    if (!s || !live(seat)) continue;
    const a = activity.get(seat.player_id) ?? { lastPlayed: null, games: 0 };
    if (!a.lastPlayed || s.started_at > a.lastPlayed) a.lastPlayed = s.started_at;
    if (s.status === 'finished') a.games++;
    activity.set(seat.player_id, a);
  }
  return activity;
}

/** Most recently played first; players who never played follow alphabetically. */
export function byRecent<T extends { id: string; name: string }>(players: T[], activity: Map<string, PlayerActivity>): T[] {
  return [...players].sort((a, b) => {
    const la = activity.get(a.id)?.lastPlayed ?? '';
    const lb = activity.get(b.id)?.lastPlayed ?? '';
    return lb.localeCompare(la) || a.name.localeCompare(b.name, 'da');
  });
}

export async function loadResultRows(): Promise<ResultRow[]> {
  const [sessions, seats] = await Promise.all([db.sessions.toArray(), db.session_players.toArray()]);
  const finished = new Map(sessions.filter((s) => s.status === 'finished' && live(s)).map((s) => [s.id, s]));
  return seats
    .filter((x) => live(x) && finished.has(x.session_id))
    .map((x) => {
      const s = finished.get(x.session_id)!;
      return {
        sessionId: s.id, gameId: s.game_id, playerId: x.player_id, endedAt: s.ended_at ?? s.started_at,
        finalScore: x.final_score, placement: x.placement, isWinner: !!x.is_winner,
      };
    });
}

export async function loadExportRows(): Promise<{ results: Record<string, unknown>[]; entries: Record<string, unknown>[] }> {
  const [sessions, games, players, teams, seats, entries] = await Promise.all([
    db.sessions.toArray(), db.games.toArray(), db.players.toArray(),
    db.session_teams.toArray(), db.session_players.toArray(), db.score_entries.toArray(),
  ]);
  const gameName = new Map(games.map((g) => [g.id, g.name]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const liveSessions = new Map(sessions.filter(live).map((s) => [s.id, s]));
  const liveSeats = seats
    .filter((x) => live(x) && liveSessions.has(x.session_id))
    .sort((a, b) => a.seat - b.seat);

  const results = liveSeats
    .filter((x) => liveSessions.get(x.session_id)!.status === 'finished')
    .map((x) => {
      const s = liveSessions.get(x.session_id)!;
      return {
        session_id: s.id,
        game_name: gameName.get(s.game_id) ?? '',
        started_at: s.started_at,
        ended_at: s.ended_at,
        player_name: playerName.get(x.player_id) ?? '',
        team_name: x.team_id ? teamName.get(x.team_id) ?? '' : '',
        final_score: x.final_score,
        placement: x.placement,
        is_winner: !!x.is_winner,
        player_count: liveSeats.filter((y) => y.session_id === s.id).length,
      };
    });

  const entryRows = entries
    .filter((e) => live(e) && liveSessions.has(e.session_id))
    .map((e) => {
      const s = liveSessions.get(e.session_id)!;
      return {
        session_id: s.id,
        game_name: gameName.get(s.game_id) ?? '',
        started_at: s.started_at,
        player_name: e.player_id ? playerName.get(e.player_id) ?? '' : '',
        team_name: e.team_id ? teamName.get(e.team_id) ?? '' : '',
        round_no: e.round_no,
        category: e.category,
        points: e.points,
      };
    });

  return { results, entries: entryRows };
}
