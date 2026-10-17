import { describe, expect, it } from 'vitest';
import { traitorCountWarning, traitorWinner } from '../../src/games/traitors';

describe('traitorWinner', () => {
  it('traitors win when at least one traitor survived', () => {
    expect(traitorWinner([
      { role: 'traitor', outcome: 'overlevede' },
      { role: 'loyal', outcome: 'myrdet' },
      { role: 'loyal', outcome: 'overlevede' },
    ])).toBe('traitor');
  });

  it('the loyal win when every traitor was murdered or banished', () => {
    expect(traitorWinner([
      { role: 'traitor', outcome: 'forvist' },
      { role: 'loyal', outcome: 'myrdet' },
      { role: 'loyal', outcome: 'overlevede' },
    ])).toBe('loyal');
  });
});

describe('traitorCountWarning', () => {
  it('is quiet when the count matches', () => {
    expect(traitorCountWarning([{ role: 'traitor' }, { role: 'loyal' }], 1)).toBeNull();
  });

  it('warns in Danish with singular and plural', () => {
    expect(traitorCountWarning([{ role: 'loyal' }, { role: 'loyal' }], 1)).toBe('Du har markeret 0 forrædere, men valgte 1 ved start.');
    expect(traitorCountWarning([{ role: 'traitor' }, { role: 'loyal' }], 2)).toBe('Du har markeret 1 forræder, men valgte 2 ved start.');
  });
});
