import { describe, expect, it } from 'vitest';
import { scoreDice, validValues, yatzyCategories, yatzyTotals } from '../../src/games/yatzy';

describe('yatzyCategories', () => {
  it('has 15 fields for 5 dice and 20 for 6 dice', () => {
    expect(yatzyCategories(5)).toHaveLength(15);
    expect(yatzyCategories(6)).toHaveLength(20);
  });
});

describe('scoreDice', () => {
  it.each([
    ['n4', [4, 4, 1, 4, 2], 12],
    ['pair', [2, 2, 5, 5, 1], 10],
    ['twoPairs', [1, 1, 6, 6, 4], 14],
    ['twoPairs', [3, 3, 3, 3, 1], 0],
    ['threeKind', [2, 5, 5, 5, 1], 15],
    ['fourKind', [6, 6, 6, 6, 6], 24],
    ['smallStraight', [5, 3, 1, 2, 4], 15],
    ['largeStraight', [6, 3, 5, 2, 4], 20],
    ['fullHouse', [2, 2, 3, 3, 3], 13],
    ['fullHouse', [3, 3, 3, 3, 3], 0],
    ['chance', [1, 2, 3, 4, 6], 16],
    ['yatzy', [5, 5, 5, 5, 5], 50],
    ['yatzy', [5, 5, 5, 5, 4], 0],
  ])('%s of %j = %i (5 dice)', (cat, dice, expected) => {
    expect(scoreDice(cat, dice)).toBe(expected);
  });

  it.each([
    ['threePairs', [1, 1, 2, 2, 6, 6], 18],
    ['fiveKind', [4, 4, 4, 4, 4, 1], 20],
    ['fullStraight', [6, 5, 4, 3, 2, 1], 21],
    ['fullHouse', [5, 5, 5, 6, 6, 1], 27],
    ['villa', [1, 1, 1, 6, 6, 6], 21],
    ['tower', [5, 5, 5, 5, 2, 2], 24],
    ['yatzy', [3, 3, 3, 3, 3, 3], 100],
  ])('%s of %j = %i (6 dice)', (cat, dice, expected) => {
    expect(scoreDice(cat, dice)).toBe(expected);
  });
});

describe('validValues', () => {
  it('lists multiples of the face for the upper section', () => {
    expect(validValues(5, 'n4')).toEqual([0, 4, 8, 12, 16, 20]);
    expect(validValues(6, 'n6').at(-1)).toBe(36);
  });

  it('never allows impossible full house scores', () => {
    const v = validValues(5, 'fullHouse');
    expect(v[0]).toBe(0);
    expect(v).not.toContain(6);
    expect(v[1]).toBe(7);
    expect(v.at(-1)).toBe(28);
  });

  it('has only 0 and the fixed value for straights and yatzy', () => {
    expect(validValues(5, 'smallStraight')).toEqual([0, 15]);
    expect(validValues(6, 'yatzy')).toEqual([0, 100]);
  });
});

describe('yatzyTotals', () => {
  const upper63 = { n1: 3, n2: 6, n3: 9, n4: 12, n5: 15, n6: 18 };

  it('adds the bonus at 63 with 5 dice', () => {
    expect(yatzyTotals(5, { ...upper63, chance: 20 })).toEqual({ upper: 63, bonus: 50, total: 133 });
  });

  it('gives no bonus at 62', () => {
    expect(yatzyTotals(5, { ...upper63, n1: 2 }).bonus).toBe(0);
  });

  it('needs 84 for the bonus with 6 dice', () => {
    expect(yatzyTotals(6, upper63).bonus).toBe(0);
    expect(yatzyTotals(6, { n1: 4, n2: 8, n3: 12, n4: 16, n5: 20, n6: 24 }).bonus).toBe(50);
  });
});
