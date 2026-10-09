import { describe, expect, it } from 'vitest';
import { parsePoints } from '../../src/ui/points';

describe('parsePoints', () => {
  it.each([
    ['12', false, 12],
    [' 7 ', false, 7],
    ['5', true, -5],
    ['0', true, 0],
    ['', false, null],
    ['1a', false, null],
    ['-3', false, null],
  ])('parsePoints(%j, %s) = %s', (text, neg, expected) => {
    expect(parsePoints(text, neg)).toBe(expected);
  });
});
