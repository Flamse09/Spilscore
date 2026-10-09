import { describe, expect, it } from 'vitest';
import { davoserjasSums, describeSums } from '../../src/games/davoserjas';

describe('davoserjasSums', () => {
  it('is exact for 4 players (all 52 cards dealt)', () => {
    expect(davoserjasSums('tricks', 4)).toEqual([13]);
    expect(davoserjasSums('clubs', 4)).toEqual([13]);
    expect(davoserjasSums('queens', 4)).toEqual([20]);
    expect(davoserjasSums('kingOfClubs', 4)).toEqual([15]);
    expect(davoserjasSums('firstLast', 4)).toEqual([20]);
    expect(davoserjasSums('all', 4)).toEqual([81]);
  });

  it('widens when cards are left out (3 players: 17 each, 1 left)', () => {
    expect(davoserjasSums('tricks', 3)).toEqual([17]);
    expect(davoserjasSums('clubs', 3)).toEqual([12, 13]);
    expect(davoserjasSums('queens', 3)).toEqual([15, 20]);
    expect(davoserjasSums('kingOfClubs', 3)).toEqual([0, 15]);
    expect(davoserjasSums('all', 3)).toEqual([64, 65, 69, 70, 79, 80, 84, 85]);
  });

  it('caps removed queens at 4 (6 players: 4 left out)', () => {
    expect(davoserjasSums('tricks', 6)).toEqual([8]);
    expect(davoserjasSums('queens', 6)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe('describeSums', () => {
  it('formats exact, contiguous and scattered sums in Danish', () => {
    expect(describeSums([13])).toBe('13');
    expect(describeSums([12, 13])).toBe('12–13');
    expect(describeSums([10, 15, 20])).toBe('10, 15 eller 20');
    expect(describeSums([0, 15])).toBe('0 eller 15');
  });
});
