export interface ResultRow {
  sessionId: string;
  gameId: string;
  playerId: string;
  endedAt: string;
  finalScore: number | null;
  placement: number | null;
  isWinner: boolean;
}
