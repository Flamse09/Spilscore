import { describe, expect, it } from 'vitest';
import { rank } from '../../src/games/placement';

describe('rank', () => {
  it('ranks highest first when scoring is high', () => {
    const r = rank([{ id: 'a', total: 10 }, { id: 'b', total: 30 }, { id: 'c', total: 20 }], 'high');
    expect(r.map((x) => [x.id, x.placement, x.isWinner])).toEqual([
      ['b', 1, true],
      ['c', 2, false],
      ['a', 3, false],
    ]);
  });

  it('ranks lowest first when scoring is low', () => {
    const r = rank([{ id: 'a', total: 10 }, { id: 'b', total: 30 }], 'low');
    expect(r[0]).toMatchObject({ id: 'a', placement: 1, isWinner: true });
  });

  it('shares placement on ties and skips the next', () => {
    const r = rank([{ id: 'a', total: 5 }, { id: 'b', total: 5 }, { id: 'c', total: 1 }], 'high');
    expect(r.map((x) => x.placement)).toEqual([1, 1, 3]);
    expect(r.filter((x) => x.isWinner).map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});
