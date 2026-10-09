import { describe, expect, it } from 'vitest';
import { nextDelay } from '../../src/sync/runner';

describe('nextDelay', () => {
  it('polls every minute when healthy', () => {
    expect(nextDelay(0)).toBe(60_000);
  });

  it('backs off exponentially and caps at 5 minutes', () => {
    expect(nextDelay(1)).toBe(5_000);
    expect(nextDelay(2)).toBe(10_000);
    expect(nextDelay(4)).toBe(40_000);
    expect(nextDelay(20)).toBe(300_000);
  });
});
