import type { Scoring } from './types';

export interface Standing {
  id: string;
  total: number;
}

export interface Ranked extends Standing {
  placement: number;
  isWinner: boolean;
}

export function rank(standings: Standing[], scoring: Scoring): Ranked[] {
  const better = (a: number, b: number) => (scoring === 'high' ? a > b : a < b);
  const sorted = [...standings].sort((a, b) => (scoring === 'high' ? b.total - a.total : a.total - b.total));
  return sorted.map((s) => {
    const placement = sorted.filter((o) => better(o.total, s.total)).length + 1;
    return { ...s, placement, isWinner: placement === 1 };
  });
}
