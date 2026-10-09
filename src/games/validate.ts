import type { GameDef } from './types';

export function startProblem(game: GameDef, playerCount: number, teamSizes: number[] | null): string | null {
  const { minPlayers, maxPlayers } = game.config;
  if (playerCount < minPlayers) return `Vælg mindst ${minPlayers} spiller${minPlayers === 1 ? '' : 'e'}`;
  if (maxPlayers !== undefined && playerCount > maxPlayers) return `Højst ${maxPlayers} spillere`;
  if (teamSizes && teamSizes.some((n) => n === 0)) return 'Alle hold skal have mindst én spiller';
  return null;
}
