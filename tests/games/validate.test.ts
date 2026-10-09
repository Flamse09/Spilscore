import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { startProblem } from '../../src/games/validate';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;

describe('startProblem', () => {
  it('requires the minimum number of players', () => {
    expect(startProblem(game('davoserjas'), 2, null)).toBe('Vælg mindst 3 spillere');
    expect(startProblem(game('yatzy'), 0, null)).toBe('Vælg mindst 1 spiller');
  });

  it('enforces the maximum', () => {
    expect(startProblem(game('davoserjas'), 8, null)).toBe('Højst 7 spillere');
  });

  it('rejects empty teams', () => {
    expect(startProblem(game('hitster'), 3, [3, 0])).toBe('Alle hold skal have mindst én spiller');
  });

  it('returns null when ready', () => {
    expect(startProblem(game('500'), 2, null)).toBeNull();
  });
});
