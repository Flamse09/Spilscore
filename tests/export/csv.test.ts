import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/export/csv';

describe('toCsv', () => {
  it('writes a header and semicolon-separated rows', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: null }])).toBe('a;b\r\n1;x\r\n2;');
  });

  it('quotes values containing separators, quotes or newlines', () => {
    expect(toCsv([{ a: 'x;y', b: 'say "hi"' }])).toBe('a;b\r\n"x;y";"say ""hi"""');
  });

  it('neutralises text that Excel would treat as a formula, but keeps negative numbers', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: -5, c: '-5' }])).toBe("a;b;c\r\n'=SUM(A1);-5;-5");
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});
