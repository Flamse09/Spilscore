import Dexie, { type Table } from 'dexie';
import type { GameConfig, GameType } from '../games/types';

export interface BaseRow {
  id: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PlayerRow extends BaseRow {
  name: string;
  archived: boolean;
}

export interface GameRow extends BaseRow {
  key: string;
  name: string;
  type: GameType;
  config: GameConfig;
  built_in: boolean;
}

export type SessionStatus = 'in_progress' | 'finished' | 'abandoned';

export interface SessionRow extends BaseRow {
  game_id: string;
  options: Record<string, number>;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  note: string | null;
}

export interface TeamRow extends BaseRow {
  session_id: string;
  name: string;
  seat: number;
}

export interface SessionPlayerRow extends BaseRow {
  session_id: string;
  player_id: string;
  team_id: string | null;
  seat: number;
  final_score: number | null;
  placement: number | null;
  is_winner: boolean | null;
}

export interface ScoreEntryRow extends BaseRow {
  session_id: string;
  player_id: string | null;
  team_id: string | null;
  round_no: number | null;
  category: string | null;
  points: number;
}

export const SYNC_TABLES = ['players', 'games', 'sessions', 'session_teams', 'session_players', 'score_entries'] as const;
export type TableName = (typeof SYNC_TABLES)[number];

export interface OutboxRow {
  seq?: number;
  table: TableName;
  row_id: string;
}

export interface MetaRow {
  key: string;
  value: string;
}

export class SpilscoreDB extends Dexie {
  players!: Table<PlayerRow, string>;
  games!: Table<GameRow, string>;
  sessions!: Table<SessionRow, string>;
  session_teams!: Table<TeamRow, string>;
  session_players!: Table<SessionPlayerRow, string>;
  score_entries!: Table<ScoreEntryRow, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'spilscore') {
    super(name);
    this.version(1).stores({
      players: 'id, updated_at',
      games: 'id, key, updated_at',
      sessions: 'id, game_id, status, started_at, updated_at',
      session_teams: 'id, session_id, updated_at',
      session_players: 'id, session_id, player_id, updated_at',
      score_entries: 'id, session_id, updated_at',
      outbox: '++seq, table, row_id',
      meta: 'key',
    });
  }
}

export const db = new SpilscoreDB();
