import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';

describe('BUILT_IN_GAMES', () => {
  it('has unique ids and keys', () => {
    expect(new Set(BUILT_IN_GAMES.map((g) => g.id)).size).toBe(BUILT_IN_GAMES.length);
    expect(new Set(BUILT_IN_GAMES.map((g) => g.key)).size).toBe(BUILT_IN_GAMES.length);
  });

  it('defines the five launch games', () => {
    expect(BUILT_IN_GAMES.map((g) => g.key)).toEqual(['yatzy', '500', 'flip7', 'davoserjas', 'hitster']);
  });

  it('gives Davoserjas seven rounds (6 = all rules, 7 = Kabalen), lowest wins, 3-7 players', () => {
    const d = BUILT_IN_GAMES.find((g) => g.key === 'davoserjas')!;
    expect(d.config.rounds!.map((r) => r.key)).toEqual(['tricks', 'clubs', 'queens', 'kingOfClubs', 'firstLast', 'all', 'kabale']);
    expect(d.config).toMatchObject({ scoring: 'low', minPlayers: 3, maxPlayers: 7 });
  });
});
