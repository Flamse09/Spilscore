import { describe, expect, it } from 'vitest';
import { href, parseRoute } from '../../src/ui/router';

describe('router', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/new', { name: 'new' }],
    ['#/play/abc-123', { name: 'play', id: 'abc-123' }],
    ['#/play', { name: 'home' }],
    ['#/players', { name: 'players' }],
    ['#/history', { name: 'history' }],
    ['#/stats', { name: 'stats' }],
    ['#/settings', { name: 'settings' }],
    ['#/nonsense', { name: 'home' }],
  ])('parses %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips through href', () => {
    expect(parseRoute(href({ name: 'play', id: 'x1' }))).toEqual({ name: 'play', id: 'x1' });
    expect(href({ name: 'home' })).toBe('#/');
  });
});
