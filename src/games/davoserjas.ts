import type { CheckKind } from './types';

type SingleCheck = Exclude<CheckKind, 'all'>;
const SINGLE_CHECKS: SingleCheck[] = ['tricks', 'clubs', 'queens', 'kingOfClubs', 'firstLast'];

function steps(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max; v += step) values.push(v);
  return values;
}

/** Possible sums for one rule when all cards are dealt and 52 mod N cards are left out. */
function singleSums(check: SingleCheck, players: number): number[] {
  const left = 52 % players;
  switch (check) {
    case 'tricks':
      return [Math.floor(52 / players)];
    case 'clubs':
      return steps(Math.max(0, 13 - left), 13, 1);
    case 'queens':
      return steps(20 - 5 * Math.min(left, 4), 20, 5);
    case 'kingOfClubs':
      return left > 0 ? [0, 15] : [15];
    case 'firstLast':
      return [20];
  }
}

/** Every possible round sum, ascending. 'all' combines the five single-rule rounds. */
export function davoserjasSums(check: CheckKind, players: number): number[] {
  if (check !== 'all') return singleSums(check, players);
  let sums = [0];
  for (const c of SINGLE_CHECKS) {
    const values = singleSums(c, players);
    sums = [...new Set(sums.flatMap((s) => values.map((v) => s + v)))];
  }
  return sums.sort((a, b) => a - b);
}

export function describeSums(values: number[]): string {
  if (values.length === 1) return String(values[0]);
  const contiguous = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
  if (contiguous) return `${values[0]}–${values.at(-1)}`;
  return `${values.slice(0, -1).join(', ')} eller ${values.at(-1)}`;
}
