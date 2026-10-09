export type GameType = 'open_rounds' | 'fixed_rounds' | 'scoresheet' | 'result_only';
export type Scoring = 'high' | 'low';
export type TeamMode = 'none' | 'optional' | 'required';
export type CheckKind = 'tricks' | 'clubs' | 'queens' | 'kingOfClubs' | 'firstLast' | 'all';

export interface RoundDef {
  key: string;
  label: string;
  rule: string;
  check?: CheckKind;
}

export interface OptionDef {
  key: string;
  label: string;
  values: number[];
  default: number;
}

export interface GameConfig {
  scoring: Scoring;
  minPlayers: number;
  maxPlayers?: number;
  teams: TeamMode;
  allowNegative?: boolean;
  bustButton?: boolean;
  target?: number;
  rounds?: RoundDef[];
  sheet?: 'yatzy';
  trackScore?: boolean;
  options?: OptionDef[];
}

export interface GameDef {
  id: string;
  key: string;
  name: string;
  type: GameType;
  config: GameConfig;
}
