export type Dice = 5 | 6;

export interface YatzyCategory {
  key: string;
  label: string;
  section: 'upper' | 'lower';
}

const lower = (key: string, label: string): YatzyCategory => ({ key, label, section: 'lower' });

const UPPER: YatzyCategory[] = [1, 2, 3, 4, 5, 6].map((f) => ({ key: `n${f}`, label: `${f}'ere`, section: 'upper' }));

const LOWER_5: YatzyCategory[] = [
  lower('pair', '1 par'),
  lower('twoPairs', '2 par'),
  lower('threeKind', '3 ens'),
  lower('fourKind', '4 ens'),
  lower('smallStraight', 'Lille straight'),
  lower('largeStraight', 'Stor straight'),
  lower('fullHouse', 'Fuldt hus'),
  lower('chance', 'Chance'),
  lower('yatzy', 'Yatzy'),
];

const LOWER_6: YatzyCategory[] = [
  lower('pair', '1 par'),
  lower('twoPairs', '2 par'),
  lower('threePairs', '3 par'),
  lower('threeKind', '3 ens'),
  lower('fourKind', '4 ens'),
  lower('fiveKind', '5 ens'),
  lower('smallStraight', 'Lille straight'),
  lower('largeStraight', 'Stor straight'),
  lower('fullStraight', 'Royal straight'),
  lower('fullHouse', 'Hus (3+2)'),
  lower('villa', 'Villa (3+3)'),
  lower('tower', 'Tårn (4+2)'),
  lower('chance', 'Chance'),
  lower('yatzy', 'Maxi Yatzy'),
];

export function yatzyCategories(dice: Dice): YatzyCategory[] {
  return [...UPPER, ...(dice === 6 ? LOWER_6 : LOWER_5)];
}

export const YATZY_BONUS: Record<Dice, { threshold: number; bonus: number }> = {
  5: { threshold: 63, bonus: 50 },
  6: { threshold: 84, bonus: 50 },
};

const FACES_DESC = [6, 5, 4, 3, 2, 1];

function counts(dice: number[]): number[] {
  const c = new Array<number>(7).fill(0);
  for (const d of dice) c[d]++;
  return c;
}

function bestCombo(c: number[], a: number, b: number): number {
  let best = 0;
  for (const x of FACES_DESC) {
    for (const y of FACES_DESC) {
      if (x !== y && c[x] >= a && c[y] >= b) best = Math.max(best, x * a + y * b);
    }
  }
  return best;
}

export function scoreDice(cat: string, dice: number[]): number {
  const c = counts(dice);
  const withAtLeast = (n: number) => FACES_DESC.filter((f) => c[f] >= n);
  const has = (...faces: number[]) => faces.every((f) => c[f] >= 1);
  const upper = /^n([1-6])$/.exec(cat);
  if (upper) {
    const f = Number(upper[1]);
    return c[f] * f;
  }
  switch (cat) {
    case 'pair': {
      const p = withAtLeast(2);
      return p.length ? p[0] * 2 : 0;
    }
    case 'twoPairs': {
      const p = withAtLeast(2);
      return p.length >= 2 ? (p[0] + p[1]) * 2 : 0;
    }
    case 'threePairs': {
      const p = withAtLeast(2);
      return p.length >= 3 ? (p[0] + p[1] + p[2]) * 2 : 0;
    }
    case 'threeKind': {
      const p = withAtLeast(3);
      return p.length ? p[0] * 3 : 0;
    }
    case 'fourKind': {
      const p = withAtLeast(4);
      return p.length ? p[0] * 4 : 0;
    }
    case 'fiveKind': {
      const p = withAtLeast(5);
      return p.length ? p[0] * 5 : 0;
    }
    case 'smallStraight':
      return has(1, 2, 3, 4, 5) ? 15 : 0;
    case 'largeStraight':
      return has(2, 3, 4, 5, 6) ? 20 : 0;
    case 'fullStraight':
      return has(1, 2, 3, 4, 5, 6) ? 21 : 0;
    case 'fullHouse':
      return bestCombo(c, 3, 2);
    case 'villa':
      return bestCombo(c, 3, 3);
    case 'tower':
      return bestCombo(c, 4, 2);
    case 'chance':
      return dice.reduce((a, b) => a + b, 0);
    case 'yatzy':
      return withAtLeast(dice.length).length ? (dice.length === 6 ? 100 : 50) : 0;
  }
  throw new Error(`Ukendt kategori: ${cat}`);
}

function* multisets(n: number, min = 1): Generator<number[]> {
  if (n === 0) {
    yield [];
    return;
  }
  for (let f = min; f <= 6; f++) {
    for (const rest of multisets(n - 1, f)) yield [f, ...rest];
  }
}

const valueCache = new Map<string, number[]>();

export function validValues(dice: Dice, cat: string): number[] {
  const key = `${dice}:${cat}`;
  let values = valueCache.get(key);
  if (!values) {
    const set = new Set<number>([0]);
    for (const roll of multisets(dice)) set.add(scoreDice(cat, roll));
    values = [...set].sort((a, b) => a - b);
    valueCache.set(key, values);
  }
  return values;
}

export function yatzyTotals(dice: Dice, filled: Record<string, number>): { upper: number; bonus: number; total: number } {
  const cats = yatzyCategories(dice);
  const sum = (section: 'upper' | 'lower') =>
    cats.filter((c) => c.section === section).reduce((s, c) => s + (filled[c.key] ?? 0), 0);
  const upper = sum('upper');
  const { threshold, bonus } = YATZY_BONUS[dice];
  const earned = upper >= threshold ? bonus : 0;
  return { upper, bonus: earned, total: upper + earned + sum('lower') };
}
