# Spilscore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable iPhone PWA that keeps score in Yatzy (5/6 dice), 500, Flip 7, Davoserjas, Hitster and custom result-only games, stores everything locally first and syncs to Supabase for statistics in-app and in Power BI.

**Architecture:** Preact + TypeScript SPA built by Vite. Pure game logic (`src/games`) and statistics (`src/stats`) have no I/O. All writes go to IndexedDB (Dexie) through one `save()` function that also appends to an outbox; a sync runner pushes the outbox to Supabase and pulls newer rows back. Deployed as static files to GitHub Pages.

**Tech Stack:** Node 22 LTS, Vite, Preact, TypeScript (strict), Dexie 4, @supabase/supabase-js 2, vite-plugin-pwa, Vitest, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-09-spilscore-design.md`

## Global Constraints

- All UI text is Danish.
- Vite `base` is `/Spilscore/`; the app is served at `https://flamse09.github.io/Spilscore/`.
- Supabase URL `https://qskvbsjjqmpdtwlefxjx.supabase.co`; only the publishable key (`sb_publishable_…`) may appear in the repo. Never commit a secret/service_role key or the database password.
- Every row id is generated on the device with `crypto.randomUUID()`.
- Every write to a synced table goes through `save()` in `src/db/repo.ts`, which sets `updated_at` and appends to the outbox. Never call `db.<table>.put` directly for synced tables (exception: built-in game seeding, which is not synced).
- Deletion is always soft (`deleted_at`); every read filters out rows with `deleted_at`.
- Synced tables in push order: `players`, `games`, `sessions`, `session_teams`, `session_players`, `score_entries`.
- Built-in games have fixed ids `00000000-0000-4000-8000-00000000000N` (N = 1..5) and are never pushed.
- Sum checks and validation are warnings, never blockers — except Yatzy cells, which only accept valid values.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All commands run from the repo root.

## File Map

```
index.html                       app shell (iOS meta tags)
vite.config.ts                   Vite + Preact + PWA + Vitest config
.env                             VITE_SUPABASE_URL / VITE_SUPABASE_KEY (publishable, committed)
public/icon.svg                  source icon (PNGs generated from it)
supabase/migrations/001_init.sql tables, RLS, grants, view, built-in seed
supabase/migrations/002_powerbi_reader.sql   read-only login for Power BI
.github/workflows/deploy.yml     test + build + GitHub Pages
.github/workflows/keepalive.yml  weekly Supabase ping
src/main.tsx                     bootstrap: seed games, render, sync loop, SW
src/games/types.ts               GameDef / GameConfig types
src/games/builtins.ts            BUILT_IN_GAMES
src/games/placement.ts           rank()
src/games/yatzy.ts               categories, scoreDice, validValues, totals
src/games/davoserjas.ts          sum ranges per round
src/games/results.ts             computeResults(), isGameOver()
src/games/validate.ts            startProblem()
src/db/schema.ts                 Dexie schema + row types
src/db/repo.ts                   base(), nowIso(), save()
src/db/actions.ts                domain writes + loadSessionBundle()
src/db/queries.ts                read models for lists, stats, export
src/sync/sync.ts                 push() / pull() against RemoteClient
src/sync/runner.ts               scheduling, backoff, status
src/sync/supabaseClient.ts       supabase-js client + RemoteClient adapter
src/sync/auth.ts                 email OTP login
src/stats/stats.ts               pure statistics
src/export/csv.ts                toCsv(), shareOrDownload()
src/ui/…                         router, hooks, components, screens, styles
tests/…                          Vitest suites mirroring src/
```

---

## Prerequisites (Frederik, once)

Node.js is not installed on this PC. Install Node 22 LTS (asks Frederik's permission — it downloads an installer):

```powershell
winget install OpenJS.NodeJS.LTS
```

Open a new terminal afterwards and confirm `node --version` prints `v22.x` or newer.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env`, `.gitignore`, `.claude/launch.json`, `src/main.tsx`, `src/ui/App.tsx`

**Interfaces:**
- Produces: `npm test`, `npm run build`, `npm run dev` scripts; `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "spilscore",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "icons": "pwa-assets-generator --preset minimal-2023 public/icon.svg"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install preact dexie @supabase/supabase-js
npm install -D vite @preact/preset-vite typescript vitest fake-indexeddb vite-plugin-pwa @vite-pwa/assets-generator
```

Expected: `node_modules/` created, no `ERR!` lines.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: '/Spilscore/',
  plugins: [preact()],
  test: { environment: 'node', passWithNoTests: true },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="da">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#14161a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Spilscore" />
    <title>Spilscore</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `.env`, `.gitignore`, `.claude/launch.json`**

`.env`:
```
VITE_SUPABASE_URL=https://qskvbsjjqmpdtwlefxjx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_PMGHWEQ_Qke3j6nIUKremg_hVo_xP8v
```

`.gitignore`:
```
node_modules/
dist/
dev-dist/
.env.local
```

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "spilscore", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 7: Create `src/ui/App.tsx` and `src/main.tsx`**

`src/ui/App.tsx`:
```tsx
export function App() {
  return <h1>Spilscore</h1>;
}
```

`src/main.tsx`:
```tsx
import { render } from 'preact';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 8: Verify build and test runner**

Run: `npm run build`
Expected: `dist/index.html` written, no TypeScript errors.

Run: `npm test`
Expected: exits 0 ("No test files found" is fine).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Preact + TypeScript project"
```

---

### Task 2: Game types, built-in games, ranking

**Files:**
- Create: `src/games/types.ts`, `src/games/builtins.ts`, `src/games/placement.ts`
- Test: `tests/games/placement.test.ts`, `tests/games/builtins.test.ts`

**Interfaces:**
- Produces:
  - Types `GameType`, `Scoring`, `TeamMode`, `CheckKind`, `RoundDef`, `OptionDef`, `GameConfig`, `GameDef` (see code).
  - `BUILT_IN_GAMES: GameDef[]`
  - `rank(standings: Standing[], scoring: Scoring): Ranked[]` where `Standing = { id: string; total: number }`, `Ranked = Standing & { placement: number; isWinner: boolean }`. Competition ranking: ties share a placement, next placement skips (1, 1, 3).

- [ ] **Step 1: Write `src/games/types.ts`**

```ts
export type GameType = 'open_rounds' | 'fixed_rounds' | 'scoresheet' | 'result_only';
export type Scoring = 'high' | 'low';
export type TeamMode = 'none' | 'optional' | 'required';
export type CheckKind = 'tricks' | 'clubs' | 'queens' | 'kingOfClubs' | 'firstLast' | 'all';

export interface RoundDef {
  key: string;
  label: string;
  rule: string;
  check?: CheckKind;
}

export interface OptionDef {
  key: string;
  label: string;
  values: number[];
  default: number;
}

export interface GameConfig {
  scoring: Scoring;
  minPlayers: number;
  maxPlayers?: number;
  teams: TeamMode;
  allowNegative?: boolean;
  bustButton?: boolean;
  target?: number;
  rounds?: RoundDef[];
  sheet?: 'yatzy';
  trackScore?: boolean;
  options?: OptionDef[];
}

export interface GameDef {
  id: string;
  key: string;
  name: string;
  type: GameType;
  config: GameConfig;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/games/placement.test.ts`:
```ts
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
```

`tests/games/builtins.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';

describe('BUILT_IN_GAMES', () => {
  it('has unique ids and keys', () => {
    expect(new Set(BUILT_IN_GAMES.map((g) => g.id)).size).toBe(BUILT_IN_GAMES.length);
    expect(new Set(BUILT_IN_GAMES.map((g) => g.key)).size).toBe(BUILT_IN_GAMES.length);
  });

  it('defines the five launch games', () => {
    expect(BUILT_IN_GAMES.map((g) => g.key)).toEqual(['yatzy', '500', 'flip7', 'davoserjas', 'hitster']);
  });

  it('gives Davoserjas seven rounds (6 = all rules, 7 = Kabalen), lowest wins, 3-7 players', () => {
    const d = BUILT_IN_GAMES.find((g) => g.key === 'davoserjas')!;
    expect(d.config.rounds!.map((r) => r.key)).toEqual(['tricks', 'clubs', 'queens', 'kingOfClubs', 'firstLast', 'all', 'kabale']);
    expect(d.config).toMatchObject({ scoring: 'low', minPlayers: 3, maxPlayers: 7 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/games`
Expected: FAIL — cannot resolve `../../src/games/placement` / `builtins`.

- [ ] **Step 4: Implement `src/games/placement.ts`**

```ts
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
```

- [ ] **Step 5: Implement `src/games/builtins.ts`**

```ts
import type { GameDef } from './types';

export const BUILT_IN_GAMES: GameDef[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    key: 'yatzy',
    name: 'Yatzy',
    type: 'scoresheet',
    config: {
      scoring: 'high',
      minPlayers: 1,
      teams: 'none',
      sheet: 'yatzy',
      options: [{ key: 'dice', label: 'Terninger', values: [5, 6], default: 5 }],
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    key: '500',
    name: '500',
    type: 'open_rounds',
    config: { scoring: 'high', minPlayers: 2, teams: 'none', allowNegative: true, target: 500 },
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    key: 'flip7',
    name: 'Flip 7',
    type: 'open_rounds',
    config: { scoring: 'high', minPlayers: 3, teams: 'none', target: 200, bustButton: true },
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    key: 'davoserjas',
    name: 'Davoserjas',
    type: 'fixed_rounds',
    config: {
      scoring: 'low',
      minPlayers: 3,
      maxPlayers: 7,
      teams: 'none',
      rounds: [
        { key: 'tricks', label: 'Stik', rule: '1 point pr. stik', check: 'tricks' },
        { key: 'clubs', label: 'Klør', rule: '1 point pr. klør', check: 'clubs' },
        { key: 'queens', label: 'Damer', rule: '5 point pr. dame', check: 'queens' },
        { key: 'kingOfClubs', label: 'Klør konge', rule: '15 point for klør konge', check: 'kingOfClubs' },
        { key: 'firstLast', label: 'Første og sidste stik', rule: '10 point for hvert', check: 'firstLast' },
        { key: 'all', label: 'Alle regler', rule: 'Alle regler fra runde 1–5 gælder på én gang', check: 'all' },
        { key: 'kabale', label: 'Kabalen', rule: '1 point pr. kort tilbage på hånden' },
      ],
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    key: 'hitster',
    name: 'Hitster',
    type: 'result_only',
    config: { scoring: 'high', minPlayers: 2, teams: 'optional', trackScore: true },
  },
];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/games`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/games tests/games
git commit -m "feat: game types, built-in game definitions and ranking"
```

---

### Task 3: Yatzy engine

**Files:**
- Create: `src/games/yatzy.ts`
- Test: `tests/games/yatzy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Dice = 5 | 6`
  - `interface YatzyCategory { key: string; label: string; section: 'upper' | 'lower' }`
  - `yatzyCategories(dice: Dice): YatzyCategory[]`
  - `scoreDice(cat: string, dice: number[]): number`
  - `validValues(dice: Dice, cat: string): number[]` (sorted ascending, always includes 0)
  - `YATZY_BONUS: Record<Dice, { threshold: number; bonus: number }>`
  - `yatzyTotals(dice: Dice, filled: Record<string, number>): { upper: number; bonus: number; total: number }`

Category keys: `n1`..`n6`, `pair`, `twoPairs`, `threePairs`, `threeKind`, `fourKind`, `fiveKind`, `smallStraight`, `largeStraight`, `fullStraight`, `fullHouse`, `villa`, `tower`, `chance`, `yatzy`.

- [ ] **Step 1: Write the failing test**

`tests/games/yatzy.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/games/yatzy.test.ts`
Expected: FAIL — cannot resolve `../../src/games/yatzy`.

- [ ] **Step 3: Implement `src/games/yatzy.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/games/yatzy.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/games/yatzy.ts tests/games/yatzy.test.ts
git commit -m "feat: Yatzy scoring, valid values and totals for 5 and 6 dice"
```

---

### Task 4: Davoserjas checks, results and game-over

**Files:**
- Create: `src/games/davoserjas.ts`, `src/games/results.ts`, `src/games/validate.ts`
- Test: `tests/games/davoserjas.test.ts`, `tests/games/results.test.ts`, `tests/games/validate.test.ts`

**Interfaces:**
- Consumes: `rank` (Task 2), `yatzyCategories`, `yatzyTotals`, `Dice` (Task 3), `GameDef`, `CheckKind` (Task 2).
- Produces:
  - `davoserjasSums(check: CheckKind, players: number): number[]` — every possible round sum, ascending. `'all'` = every combination of the five single-rule rounds.
  - `describeSums(values: number[]): string` — Danish text: `13`, `12–13` (contiguous) or `10, 15 eller 20`.
  - `interface SeatLike { player_id: string; team_id: string | null }`
  - `interface EntryLike { player_id: string | null; team_id: string | null; round_no: number | null; category: string | null; points: number }`
  - `interface PlayerResult { player_id: string; final_score: number | null; placement: number; is_winner: boolean }`
  - `participantOf(x: { player_id: string | null; team_id: string | null }): string`
  - `computeResults(game: GameDef, options: Record<string, number>, seats: SeatLike[], entries: EntryLike[], manual?: Map<string, number>): PlayerResult[]` — `manual` maps participant id (team id or player id) → placement; used only for `result_only`.
  - `isGameOver(game: GameDef, options: Record<string, number>, seats: SeatLike[], entries: EntryLike[]): boolean`
  - `startProblem(game: GameDef, playerCount: number, teamSizes: number[] | null): string | null`

- [ ] **Step 1: Write the failing tests**

`tests/games/davoserjas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { davoserjasSums, describeSums } from '../../src/games/davoserjas';

describe('davoserjasSums', () => {
  it('is exact for 4 players (all 52 cards dealt)', () => {
    expect(davoserjasSums('tricks', 4)).toEqual([13]);
    expect(davoserjasSums('clubs', 4)).toEqual([13]);
    expect(davoserjasSums('queens', 4)).toEqual([20]);
    expect(davoserjasSums('kingOfClubs', 4)).toEqual([15]);
    expect(davoserjasSums('firstLast', 4)).toEqual([20]);
    expect(davoserjasSums('all', 4)).toEqual([81]);
  });

  it('widens when cards are left out (3 players: 17 each, 1 left)', () => {
    expect(davoserjasSums('tricks', 3)).toEqual([17]);
    expect(davoserjasSums('clubs', 3)).toEqual([12, 13]);
    expect(davoserjasSums('queens', 3)).toEqual([15, 20]);
    expect(davoserjasSums('kingOfClubs', 3)).toEqual([0, 15]);
    expect(davoserjasSums('all', 3)).toEqual([64, 65, 69, 70, 79, 80, 84, 85]);
  });

  it('caps removed queens at 4 (6 players: 4 left out)', () => {
    expect(davoserjasSums('tricks', 6)).toEqual([8]);
    expect(davoserjasSums('queens', 6)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe('describeSums', () => {
  it('formats exact, contiguous and scattered sums in Danish', () => {
    expect(describeSums([13])).toBe('13');
    expect(describeSums([12, 13])).toBe('12–13');
    expect(describeSums([10, 15, 20])).toBe('10, 15 eller 20');
    expect(describeSums([0, 15])).toBe('0 eller 15');
  });
});
```

`tests/games/results.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { computeResults, isGameOver, type EntryLike, type SeatLike } from '../../src/games/results';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;
const seats = (...ids: string[]): SeatLike[] => ids.map((player_id) => ({ player_id, team_id: null }));
const round = (round_no: number, pts: Record<string, number>, category: string | null = null): EntryLike[] =>
  Object.entries(pts).map(([player_id, points]) => ({ player_id, team_id: null, round_no, category, points }));

describe('open rounds (500)', () => {
  const entries = [...round(1, { a: 300, b: 400 }), ...round(2, { a: 250, b: 90 })];

  it('ranks by total, highest wins', () => {
    const r = computeResults(game('500'), {}, seats('a', 'b'), entries);
    expect(r).toEqual([
      { player_id: 'a', final_score: 550, placement: 1, is_winner: true },
      { player_id: 'b', final_score: 490, placement: 2, is_winner: false },
    ]);
  });

  it('is over once someone reaches the target', () => {
    expect(isGameOver(game('500'), {}, seats('a', 'b'), entries)).toBe(true);
    expect(isGameOver(game('500'), {}, seats('a', 'b'), round(1, { a: 499, b: 0 }))).toBe(false);
  });

  it('Flip 7 is not over at 190', () => {
    expect(isGameOver(game('flip7'), {}, seats('a', 'b', 'c'), round(1, { a: 190, b: 0, c: 5 }))).toBe(false);
  });
});

describe('fixed rounds (Davoserjas)', () => {
  const keys = ['tricks', 'clubs', 'queens', 'kingOfClubs', 'firstLast', 'all', 'kabale'];
  const six = keys.slice(0, 6).flatMap((k, i) => round(i + 1, { a: 2, b: 5, c: 9 }, k));

  it('is not over after six rounds', () => {
    expect(isGameOver(game('davoserjas'), {}, seats('a', 'b', 'c'), six)).toBe(false);
  });

  it('is over after the seventh round (Kabalen) and lowest wins', () => {
    const all = [...six, ...round(7, { a: 0, b: 3, c: 4 }, 'kabale')];
    expect(isGameOver(game('davoserjas'), {}, seats('a', 'b', 'c'), all)).toBe(true);
    const r = computeResults(game('davoserjas'), {}, seats('a', 'b', 'c'), all);
    expect(r.find((x) => x.is_winner)!.player_id).toBe('a');
    expect(r.find((x) => x.player_id === 'a')!.final_score).toBe(12);
  });
});

describe('scoresheet (Yatzy)', () => {
  it('uses the sheet total including bonus', () => {
    const filled = { n1: 3, n2: 6, n3: 9, n4: 12, n5: 15, n6: 18, chance: 20 };
    const entries: EntryLike[] = Object.entries(filled).map(([category, points]) => ({
      player_id: 'a', team_id: null, round_no: null, category, points,
    }));
    const r = computeResults(game('yatzy'), { dice: 5 }, seats('a'), entries);
    expect(r[0].final_score).toBe(133);
  });

  it('is over only when every field is filled for every player', () => {
    expect(isGameOver(game('yatzy'), { dice: 5 }, seats('a'), [
      { player_id: 'a', team_id: null, round_no: null, category: 'n1', points: 3 },
    ])).toBe(false);
  });
});

describe('result only (Hitster with teams)', () => {
  const s: SeatLike[] = [
    { player_id: 'a', team_id: 't1' },
    { player_id: 'b', team_id: 't1' },
    { player_id: 'c', team_id: 't2' },
  ];

  it('copies the team placement to each member and sums team points', () => {
    const entries: EntryLike[] = [{ player_id: null, team_id: 't1', round_no: null, category: 'result', points: 10 }];
    const r = computeResults(game('hitster'), {}, s, entries, new Map([['t1', 1], ['t2', 2]]));
    expect(r).toEqual([
      { player_id: 'a', final_score: 10, placement: 1, is_winner: true },
      { player_id: 'b', final_score: 10, placement: 1, is_winner: true },
      { player_id: 'c', final_score: null, placement: 2, is_winner: false },
    ]);
  });

  it('is never auto-finished', () => {
    expect(isGameOver(game('hitster'), {}, s, [])).toBe(false);
  });
});
```

`tests/games/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUILT_IN_GAMES } from '../../src/games/builtins';
import { startProblem } from '../../src/games/validate';

const game = (key: string) => BUILT_IN_GAMES.find((g) => g.key === key)!;

describe('startProblem', () => {
  it('requires the minimum number of players', () => {
    expect(startProblem(game('davoserjas'), 2, null)).toBe('Vælg mindst 3 spillere');
    expect(startProblem(game('yatzy'), 0, null)).toBe('Vælg mindst 1 spiller');
  });

  it('enforces the maximum', () => {
    expect(startProblem(game('davoserjas'), 8, null)).toBe('Højst 7 spillere');
  });

  it('rejects empty teams', () => {
    expect(startProblem(game('hitster'), 3, [3, 0])).toBe('Alle hold skal have mindst én spiller');
  });

  it('returns null when ready', () => {
    expect(startProblem(game('500'), 2, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/games`
Expected: FAIL — missing modules `davoserjas`, `results`, `validate`.

- [ ] **Step 3: Implement `src/games/davoserjas.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/games/results.ts`**

```ts
import { rank } from './placement';
import type { GameDef } from './types';
import { yatzyCategories, yatzyTotals, type Dice } from './yatzy';

export interface SeatLike {
  player_id: string;
  team_id: string | null;
}

export interface EntryLike {
  player_id: string | null;
  team_id: string | null;
  round_no: number | null;
  category: string | null;
  points: number;
}

export interface PlayerResult {
  player_id: string;
  final_score: number | null;
  placement: number;
  is_winner: boolean;
}

export function participantOf(x: { player_id: string | null; team_id: string | null }): string {
  return (x.team_id ?? x.player_id)!;
}

export function diceOf(options: Record<string, number>): Dice {
  return options.dice === 6 ? 6 : 5;
}

function usesTeams(game: GameDef, seats: SeatLike[]): boolean {
  return game.config.teams !== 'none' && seats.some((s) => s.team_id !== null);
}

function sumByParticipant(entries: EntryLike[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const e of entries) sums.set(participantOf(e), (sums.get(participantOf(e)) ?? 0) + e.points);
  return sums;
}

function filledFor(entries: EntryLike[], participant: string): Record<string, number> {
  const filled: Record<string, number> = {};
  for (const e of entries) if (e.category && participantOf(e) === participant) filled[e.category] = e.points;
  return filled;
}

export function computeResults(
  game: GameDef,
  options: Record<string, number>,
  seats: SeatLike[],
  entries: EntryLike[],
  manual?: Map<string, number>,
): PlayerResult[] {
  const teams = usesTeams(game, seats);
  const key = (s: SeatLike) => (teams ? s.team_id! : s.player_id);
  const participants = [...new Set(seats.map(key))];
  const sums = sumByParticipant(entries);
  const byParticipant = new Map<string, { total: number | null; placement: number }>();

  if (game.type === 'result_only') {
    for (const p of participants) {
      byParticipant.set(p, { total: sums.get(p) ?? null, placement: manual?.get(p) ?? participants.length });
    }
  } else {
    const standings = participants.map((id) => ({
      id,
      total: game.type === 'scoresheet' ? yatzyTotals(diceOf(options), filledFor(entries, id)).total : sums.get(id) ?? 0,
    }));
    for (const r of rank(standings, game.config.scoring)) byParticipant.set(r.id, { total: r.total, placement: r.placement });
  }

  return seats.map((s) => {
    const r = byParticipant.get(key(s))!;
    return { player_id: s.player_id, final_score: r.total, placement: r.placement, is_winner: r.placement === 1 };
  });
}

export function isGameOver(
  game: GameDef,
  options: Record<string, number>,
  seats: SeatLike[],
  entries: EntryLike[],
): boolean {
  const ids = seats.map((s) => s.player_id);
  switch (game.type) {
    case 'open_rounds': {
      const target = game.config.target;
      if (target === undefined) return false;
      return [...sumByParticipant(entries).values()].some((t) => t >= target);
    }
    case 'fixed_rounds': {
      const n = game.config.rounds?.length ?? 0;
      return ids.every(
        (id) => new Set(entries.filter((e) => e.player_id === id && e.round_no !== null).map((e) => e.round_no)).size >= n,
      );
    }
    case 'scoresheet': {
      const cats = yatzyCategories(diceOf(options));
      return ids.every((id) => cats.every((c) => entries.some((e) => e.player_id === id && e.category === c.key)));
    }
    case 'result_only':
      return false;
  }
}
```

- [ ] **Step 5: Implement `src/games/validate.ts`**

```ts
import type { GameDef } from './types';

export function startProblem(game: GameDef, playerCount: number, teamSizes: number[] | null): string | null {
  const { minPlayers, maxPlayers } = game.config;
  if (playerCount < minPlayers) return `Vælg mindst ${minPlayers} spiller${minPlayers === 1 ? '' : 'e'}`;
  if (maxPlayers !== undefined && playerCount > maxPlayers) return `Højst ${maxPlayers} spillere`;
  if (teamSizes && teamSizes.some((n) => n === 0)) return 'Alle hold skal have mindst én spiller';
  return null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/games`
Expected: PASS (all games suites).

- [ ] **Step 7: Commit**

```bash
git add src/games tests/games
git commit -m "feat: Davoserjas sum checks, result computation, game-over and start validation"
```

---

### Task 5: Local database, save() with outbox, domain actions

**Files:**
- Create: `src/db/schema.ts`, `src/db/repo.ts`, `src/db/actions.ts`, `src/db/queries.ts`
- Test: `tests/db/actions.test.ts`, `tests/db/queries.test.ts`

**Interfaces:**
- Consumes: `GameDef`, `GameType`, `GameConfig`, `Scoring`, `TeamMode` (Task 2), `BUILT_IN_GAMES` (Task 2), `computeResults` (Task 4).
- Produces:
  - Row types `BaseRow`, `PlayerRow`, `GameRow`, `SessionRow`, `TeamRow`, `SessionPlayerRow`, `ScoreEntryRow`, `OutboxRow`, `MetaRow`; `SYNC_TABLES`, `TableName`; `db: SpilscoreDB`.
  - `nowIso(): string`, `base(): BaseRow`, `save<T extends BaseRow>(table: TableName, rows: T | T[]): Promise<void>`
  - `gameDef(row: GameRow): GameDef`
  - `ensureBuiltInGames(): Promise<void>`
  - `addPlayer(name: string): Promise<PlayerRow>`, `updatePlayer(row: PlayerRow, patch: Partial<Pick<PlayerRow, 'name' | 'archived'>>): Promise<void>`
  - `interface SeatInput { playerId: string; teamIndex: number | null }`
  - `startSession(gameId: string, options: Record<string, number>, seats: SeatInput[], teamNames: string[]): Promise<string>`
  - `type SeatView = SessionPlayerRow & { name: string }`
  - `interface SessionBundle { session: SessionRow; game: GameDef; seats: SeatView[]; teams: TeamRow[]; entries: ScoreEntryRow[] }`
  - `loadSessionBundle(id: string): Promise<SessionBundle | null>`
  - `saveRound(sessionId: string, roundNo: number, points: { playerId: string; points: number }[], category?: string | null): Promise<void>`
  - `undoLastRound(sessionId: string): Promise<void>`
  - `setSheetValue(sessionId: string, playerId: string, category: string, points: number | null): Promise<void>`
  - `undoLastSheetEntry(sessionId: string): Promise<void>`
  - `interface ResultInput { participantId: string; isTeam: boolean; placement: number; points: number | null }`
  - `saveResult(sessionId: string, results: ResultInput[]): Promise<void>`
  - `finishSession(sessionId: string, manual?: Map<string, number>): Promise<void>`
  - `abandonSession(sessionId: string): Promise<void>`, `setNote(sessionId: string, note: string | null): Promise<void>`, `deleteSession(sessionId: string): Promise<void>`
  - `addCustomGame(name: string, opts: { teams: TeamMode; trackScore: boolean; scoring: Scoring }): Promise<GameRow>`
  - `interface SessionSummary { session: SessionRow; gameName: string; playerIds: string[]; players: string[]; winners: string[] }`
  - `loadSessionSummaries(): Promise<SessionSummary[]>` (newest first)
  - `loadResultRows(): Promise<ResultRow[]>` (`ResultRow` defined in `src/stats/stats.ts`, Task 8 — create that type now in Task 5 as shown below so the import resolves)
  - `loadExportRows(): Promise<{ results: Record<string, unknown>[]; entries: Record<string, unknown>[] }>`

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import Dexie, { type Table } from 'dexie';
import type { GameConfig, GameType } from '../games/types';

export interface BaseRow {
  id: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PlayerRow extends BaseRow {
  name: string;
  archived: boolean;
}

export interface GameRow extends BaseRow {
  key: string;
  name: string;
  type: GameType;
  config: GameConfig;
  built_in: boolean;
}

export type SessionStatus = 'in_progress' | 'finished' | 'abandoned';

export interface SessionRow extends BaseRow {
  game_id: string;
  options: Record<string, number>;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  note: string | null;
}

export interface TeamRow extends BaseRow {
  session_id: string;
  name: string;
  seat: number;
}

export interface SessionPlayerRow extends BaseRow {
  session_id: string;
  player_id: string;
  team_id: string | null;
  seat: number;
  final_score: number | null;
  placement: number | null;
  is_winner: boolean | null;
}

export interface ScoreEntryRow extends BaseRow {
  session_id: string;
  player_id: string | null;
  team_id: string | null;
  round_no: number | null;
  category: string | null;
  points: number;
}

export const SYNC_TABLES = ['players', 'games', 'sessions', 'session_teams', 'session_players', 'score_entries'] as const;
export type TableName = (typeof SYNC_TABLES)[number];

export interface OutboxRow {
  seq?: number;
  table: TableName;
  row_id: string;
}

export interface MetaRow {
  key: string;
  value: string;
}

export class SpilscoreDB extends Dexie {
  players!: Table<PlayerRow, string>;
  games!: Table<GameRow, string>;
  sessions!: Table<SessionRow, string>;
  session_teams!: Table<TeamRow, string>;
  session_players!: Table<SessionPlayerRow, string>;
  score_entries!: Table<ScoreEntryRow, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'spilscore') {
    super(name);
    this.version(1).stores({
      players: 'id, updated_at',
      games: 'id, key, updated_at',
      sessions: 'id, game_id, status, started_at, updated_at',
      session_teams: 'id, session_id, updated_at',
      session_players: 'id, session_id, player_id, updated_at',
      score_entries: 'id, session_id, updated_at',
      outbox: '++seq, table, row_id',
      meta: 'key',
    });
  }
}

export const db = new SpilscoreDB();
```

- [ ] **Step 2: Write `src/db/repo.ts`**

```ts
import { db, type BaseRow, type TableName } from './schema';

export const nowIso = () => new Date().toISOString();

export function base(): BaseRow {
  const t = nowIso();
  return { id: crypto.randomUUID(), owner_id: null, created_at: t, updated_at: t, deleted_at: null };
}

/** The only write path for synced tables: stamps updated_at and queues the row for sync. */
export async function save<T extends BaseRow>(table: TableName, rows: T | T[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  const t = nowIso();
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    for (const row of list) {
      await db.table(table).put({ ...row, updated_at: t });
      await db.outbox.add({ table, row_id: row.id });
    }
  });
}
```

- [ ] **Step 3: Create the `ResultRow` type in `src/stats/stats.ts`** (Task 8 adds the functions)

```ts
export interface ResultRow {
  sessionId: string;
  gameId: string;
  playerId: string;
  endedAt: string;
  finalScore: number | null;
  placement: number | null;
  isWinner: boolean;
}
```

- [ ] **Step 4: Write the failing tests**

`tests/db/actions.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/schema';
import {
  addPlayer, ensureBuiltInGames, finishSession, loadSessionBundle, saveResult, saveRound,
  setSheetValue, startSession, undoLastRound, deleteSession, addCustomGame,
} from '../../src/db/actions';

const FIVE_HUNDRED = '00000000-0000-4000-8000-000000000002';
const YATZY = '00000000-0000-4000-8000-000000000001';
const HITSTER = '00000000-0000-4000-8000-000000000005';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

async function twoPlayers() {
  const a = await addPlayer('Anna');
  const b = await addPlayer('Bo');
  return [a, b];
}

describe('players', () => {
  it('trims names and queues the row in the outbox', async () => {
    const p = await addPlayer('  Anna ');
    expect(p.name).toBe('Anna');
    expect(await db.outbox.where('row_id').equals(p.id).count()).toBe(1);
  });
});

describe('built-in games', () => {
  it('are seeded without outbox entries', async () => {
    expect(await db.games.count()).toBe(5);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('sessions', () => {
  it('creates a session with seats in order', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: b.id, teamIndex: null }, { playerId: a.id, teamIndex: null }], []);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('in_progress');
    expect(bundle.seats.map((s) => s.name)).toEqual(['Bo', 'Anna']);
    expect(bundle.game.key).toBe('500');
  });

  it('updates an existing round instead of duplicating it', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 10 }, { playerId: b.id, points: 20 }]);
    await saveRound(id, 1, [{ playerId: a.id, points: 15 }, { playerId: b.id, points: 20 }]);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.entries.find((e) => e.player_id === a.id)!.points).toBe(15);
  });

  it('undo removes the whole last round', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 10 }, { playerId: b.id, points: 20 }]);
    await saveRound(id, 2, [{ playerId: a.id, points: 5 }, { playerId: b.id, points: 5 }]);
    await undoLastRound(id);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.entries.map((e) => e.round_no)).toEqual([1, 1]);
  });

  it('finishSession writes placements and recomputes after later edits', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await saveRound(id, 1, [{ playerId: a.id, points: 500 }, { playerId: b.id, points: 100 }]);
    await finishSession(id);
    let bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('finished');
    expect(bundle.seats.find((s) => s.player_id === a.id)).toMatchObject({ final_score: 500, placement: 1, is_winner: true });

    await saveRound(id, 1, [{ playerId: a.id, points: 50 }, { playerId: b.id, points: 600 }]);
    bundle = (await loadSessionBundle(id))!;
    expect(bundle.seats.find((s) => s.player_id === b.id)).toMatchObject({ final_score: 600, is_winner: true });
  });

  it('setSheetValue sets, overwrites and clears a Yatzy cell', async () => {
    const [a] = await twoPlayers();
    const id = await startSession(YATZY, { dice: 5 }, [{ playerId: a.id, teamIndex: null }], []);
    await setSheetValue(id, a.id, 'n3', 9);
    await setSheetValue(id, a.id, 'n3', 12);
    expect((await loadSessionBundle(id))!.entries.map((e) => e.points)).toEqual([12]);
    await setSheetValue(id, a.id, 'n3', null);
    expect((await loadSessionBundle(id))!.entries).toHaveLength(0);
  });

  it('saveResult stores team points and placements', async () => {
    const [a, b] = await twoPlayers();
    const c = await addPlayer('Cille');
    const id = await startSession(HITSTER, {}, [
      { playerId: a.id, teamIndex: 0 }, { playerId: b.id, teamIndex: 0 }, { playerId: c.id, teamIndex: 1 },
    ], ['Hold 1', 'Hold 2']);
    const teams = (await loadSessionBundle(id))!.teams;
    await saveResult(id, [
      { participantId: teams[0].id, isTeam: true, placement: 2, points: 7 },
      { participantId: teams[1].id, isTeam: true, placement: 1, points: 10 },
    ]);
    const bundle = (await loadSessionBundle(id))!;
    expect(bundle.session.status).toBe('finished');
    expect(bundle.seats.find((s) => s.player_id === c.id)).toMatchObject({ placement: 1, is_winner: true, final_score: 10 });
    expect(bundle.seats.find((s) => s.player_id === a.id)).toMatchObject({ placement: 2, final_score: 7 });
  });

  it('deleteSession hides the session', async () => {
    const [a, b] = await twoPlayers();
    const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await deleteSession(id);
    expect(await loadSessionBundle(id)).toBeNull();
  });
});

describe('custom games', () => {
  it('creates a synced result-only game', async () => {
    const g = await addCustomGame('Codenames', { teams: 'required', trackScore: false, scoring: 'high' });
    expect(g).toMatchObject({ type: 'result_only', built_in: false, name: 'Codenames' });
    expect(await db.outbox.where('row_id').equals(g.id).count()).toBe(1);
  });
});
```

`tests/db/queries.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/schema';
import { addPlayer, ensureBuiltInGames, finishSession, saveRound, startSession, abandonSession } from '../../src/db/actions';
import { loadExportRows, loadResultRows, loadSessionSummaries } from '../../src/db/queries';

const FIVE_HUNDRED = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

async function playedGame() {
  const a = await addPlayer('Anna');
  const b = await addPlayer('Bo');
  const id = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
  await saveRound(id, 1, [{ playerId: a.id, points: 520 }, { playerId: b.id, points: 40 }]);
  await finishSession(id);
  return { a, b, id };
}

describe('queries', () => {
  it('summarises sessions with names and winners', async () => {
    await playedGame();
    const [s] = await loadSessionSummaries();
    expect(s).toMatchObject({ gameName: '500', players: ['Anna', 'Bo'], winners: ['Anna'] });
  });

  it('returns result rows only for finished sessions', async () => {
    const { a, b } = await playedGame();
    const id2 = await startSession(FIVE_HUNDRED, {}, [{ playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null }], []);
    await abandonSession(id2);
    const rows = await loadResultRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.playerId === a.id)).toMatchObject({ isWinner: true, finalScore: 520, placement: 1 });
  });

  it('builds export rows in the v_results shape', async () => {
    await playedGame();
    const { results, entries } = await loadExportRows();
    expect(results[0]).toMatchObject({ game_name: '500', player_name: 'Anna', placement: 1, is_winner: true, player_count: 2 });
    expect(entries).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test -- tests/db`
Expected: FAIL — cannot resolve `../../src/db/actions` / `queries`.

- [ ] **Step 6: Implement `src/db/actions.ts`**

```ts
import { BUILT_IN_GAMES } from '../games/builtins';
import { computeResults } from '../games/results';
import type { GameDef, Scoring, TeamMode } from '../games/types';
import { base, nowIso, save } from './repo';
import {
  db, type GameRow, type PlayerRow, type ScoreEntryRow, type SessionPlayerRow, type SessionRow, type TeamRow,
} from './schema';

const BUILT_IN_STAMP = '2026-10-09T00:00:00.000Z';
const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export function gameDef(row: GameRow): GameDef {
  if (row.built_in) {
    const def = BUILT_IN_GAMES.find((g) => g.key === row.key);
    if (def) return def;
  }
  return { id: row.id, key: row.key, name: row.name, type: row.type, config: row.config };
}

export async function ensureBuiltInGames(): Promise<void> {
  await db.games.bulkPut(
    BUILT_IN_GAMES.map((g) => ({
      id: g.id, owner_id: null, created_at: BUILT_IN_STAMP, updated_at: BUILT_IN_STAMP, deleted_at: null,
      key: g.key, name: g.name, type: g.type, config: g.config, built_in: true,
    })),
  );
}

export async function addPlayer(name: string): Promise<PlayerRow> {
  const row: PlayerRow = { ...base(), name: name.trim(), archived: false };
  await save('players', row);
  return row;
}

export async function updatePlayer(row: PlayerRow, patch: Partial<Pick<PlayerRow, 'name' | 'archived'>>): Promise<void> {
  await save('players', { ...row, ...patch });
}

export interface SeatInput {
  playerId: string;
  teamIndex: number | null;
}

export async function startSession(
  gameId: string,
  options: Record<string, number>,
  seats: SeatInput[],
  teamNames: string[],
): Promise<string> {
  const session: SessionRow = {
    ...base(), game_id: gameId, options, started_at: nowIso(), ended_at: null, status: 'in_progress', note: null,
  };
  const teams: TeamRow[] = teamNames.map((name, i) => ({ ...base(), session_id: session.id, name, seat: i }));
  const players: SessionPlayerRow[] = seats.map((s, i) => ({
    ...base(), session_id: session.id, player_id: s.playerId,
    team_id: s.teamIndex === null ? null : teams[s.teamIndex].id,
    seat: i, final_score: null, placement: null, is_winner: null,
  }));
  await save('sessions', session);
  if (teams.length) await save('session_teams', teams);
  await save('session_players', players);
  return session.id;
}

export type SeatView = SessionPlayerRow & { name: string };

export interface SessionBundle {
  session: SessionRow;
  game: GameDef;
  seats: SeatView[];
  teams: TeamRow[];
  entries: ScoreEntryRow[];
}

export async function loadSessionBundle(id: string): Promise<SessionBundle | null> {
  const session = await db.sessions.get(id);
  if (!session || session.deleted_at) return null;
  const gameRow = await db.games.get(session.game_id);
  if (!gameRow) return null;
  const [seats, teams, entries, players] = await Promise.all([
    db.session_players.where('session_id').equals(id).toArray(),
    db.session_teams.where('session_id').equals(id).toArray(),
    db.score_entries.where('session_id').equals(id).toArray(),
    db.players.toArray(),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  return {
    session,
    game: gameDef(gameRow),
    seats: seats.filter(live).sort((a, b) => a.seat - b.seat).map((s) => ({ ...s, name: names.get(s.player_id) ?? '?' })),
    teams: teams.filter(live).sort((a, b) => a.seat - b.seat),
    entries: entries.filter(live).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

async function liveEntries(sessionId: string): Promise<ScoreEntryRow[]> {
  return (await db.score_entries.where('session_id').equals(sessionId).toArray()).filter(live);
}

async function refreshIfFinished(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s?.status === 'finished') await finishSession(sessionId);
}

export async function saveRound(
  sessionId: string,
  roundNo: number,
  points: { playerId: string; points: number }[],
  category: string | null = null,
): Promise<void> {
  const existing = (await liveEntries(sessionId)).filter((e) => e.round_no === roundNo);
  const rows: ScoreEntryRow[] = points.map((p) => {
    const old = existing.find((e) => e.player_id === p.playerId);
    return old
      ? { ...old, points: p.points, category }
      : { ...base(), session_id: sessionId, player_id: p.playerId, team_id: null, round_no: roundNo, category, points: p.points };
  });
  await save('score_entries', rows);
  await refreshIfFinished(sessionId);
}

export async function undoLastRound(sessionId: string): Promise<void> {
  const entries = (await liveEntries(sessionId)).filter((e) => e.round_no !== null);
  const last = Math.max(0, ...entries.map((e) => e.round_no!));
  const t = nowIso();
  const rows = entries.filter((e) => e.round_no === last).map((e) => ({ ...e, deleted_at: t }));
  if (rows.length) await save('score_entries', rows);
  await refreshIfFinished(sessionId);
}

export async function setSheetValue(sessionId: string, playerId: string, category: string, points: number | null): Promise<void> {
  const old = (await liveEntries(sessionId)).find((e) => e.player_id === playerId && e.category === category);
  if (points === null) {
    if (old) await save('score_entries', { ...old, deleted_at: nowIso() });
  } else {
    await save(
      'score_entries',
      old
        ? { ...old, points }
        : { ...base(), session_id: sessionId, player_id: playerId, team_id: null, round_no: null, category, points },
    );
  }
  await refreshIfFinished(sessionId);
}

export async function undoLastSheetEntry(sessionId: string): Promise<void> {
  const entries = await liveEntries(sessionId);
  const last = entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (last) await save('score_entries', { ...last, deleted_at: nowIso() });
  await refreshIfFinished(sessionId);
}

export interface ResultInput {
  participantId: string;
  isTeam: boolean;
  placement: number;
  points: number | null;
}

export async function saveResult(sessionId: string, results: ResultInput[]): Promise<void> {
  const existing = (await liveEntries(sessionId)).filter((e) => e.category === 'result');
  const t = nowIso();
  const rows: ScoreEntryRow[] = [];
  for (const r of results) {
    const old = existing.find((e) => (r.isTeam ? e.team_id : e.player_id) === r.participantId);
    if (r.points === null) {
      if (old) rows.push({ ...old, deleted_at: t });
      continue;
    }
    rows.push(
      old
        ? { ...old, points: r.points }
        : {
            ...base(), session_id: sessionId, player_id: r.isTeam ? null : r.participantId,
            team_id: r.isTeam ? r.participantId : null, round_no: null, category: 'result', points: r.points,
          },
    );
  }
  if (rows.length) await save('score_entries', rows);
  await finishSession(sessionId, new Map(results.map((r) => [r.participantId, r.placement])));
}

function storedPlacements(b: SessionBundle): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of b.seats) if (s.placement !== null) m.set(s.team_id ?? s.player_id, s.placement);
  return m;
}

export async function finishSession(sessionId: string, manual?: Map<string, number>): Promise<void> {
  const b = await loadSessionBundle(sessionId);
  if (!b) return;
  const results = computeResults(b.game, b.session.options, b.seats, b.entries, manual ?? storedPlacements(b));
  const seatRows: SessionPlayerRow[] = b.seats.map(({ name, ...seat }) => {
    const r = results.find((x) => x.player_id === seat.player_id)!;
    return { ...seat, final_score: r.final_score, placement: r.placement, is_winner: r.is_winner };
  });
  await save('session_players', seatRows);
  await save('sessions', { ...b.session, status: 'finished', ended_at: b.session.ended_at ?? nowIso() });
}

export async function abandonSession(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, status: 'abandoned', ended_at: nowIso() });
}

export async function setNote(sessionId: string, note: string | null): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, note: note?.trim() || null });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (s) await save('sessions', { ...s, deleted_at: nowIso() });
}

export async function addCustomGame(
  name: string,
  opts: { teams: TeamMode; trackScore: boolean; scoring: Scoring },
): Promise<GameRow> {
  const row: GameRow = {
    ...base(),
    key: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    type: 'result_only',
    config: { scoring: opts.scoring, minPlayers: 1, teams: opts.teams, trackScore: opts.trackScore },
    built_in: false,
  };
  await save('games', row);
  return row;
}
```

> Note: `({ name, ...seat })` leaves `name` unused on purpose; TypeScript does not report unused variables that are siblings of a rest element.

- [ ] **Step 7: Implement `src/db/queries.ts`**

```ts
import type { ResultRow } from '../stats/stats';
import { db, type SessionRow } from './schema';

const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export interface SessionSummary {
  session: SessionRow;
  gameName: string;
  playerIds: string[];
  players: string[];
  winners: string[];
}

export async function loadSessionSummaries(): Promise<SessionSummary[]> {
  const [sessions, games, players, seats] = await Promise.all([
    db.sessions.toArray(), db.games.toArray(), db.players.toArray(), db.session_players.toArray(),
  ]);
  const gameName = new Map(games.map((g) => [g.id, g.name]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  return sessions
    .filter(live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((session) => {
      const ss = seats.filter((x) => x.session_id === session.id && live(x)).sort((a, b) => a.seat - b.seat);
      return {
        session,
        gameName: gameName.get(session.game_id) ?? '?',
        playerIds: ss.map((x) => x.player_id),
        players: ss.map((x) => playerName.get(x.player_id) ?? '?'),
        winners: ss.filter((x) => x.is_winner).map((x) => playerName.get(x.player_id) ?? '?'),
      };
    });
}

export async function loadResultRows(): Promise<ResultRow[]> {
  const [sessions, seats] = await Promise.all([db.sessions.toArray(), db.session_players.toArray()]);
  const finished = new Map(sessions.filter((s) => s.status === 'finished' && live(s)).map((s) => [s.id, s]));
  return seats
    .filter((x) => live(x) && finished.has(x.session_id))
    .map((x) => {
      const s = finished.get(x.session_id)!;
      return {
        sessionId: s.id, gameId: s.game_id, playerId: x.player_id, endedAt: s.ended_at ?? s.started_at,
        finalScore: x.final_score, placement: x.placement, isWinner: !!x.is_winner,
      };
    });
}

export async function loadExportRows(): Promise<{ results: Record<string, unknown>[]; entries: Record<string, unknown>[] }> {
  const [sessions, games, players, teams, seats, entries] = await Promise.all([
    db.sessions.toArray(), db.games.toArray(), db.players.toArray(),
    db.session_teams.toArray(), db.session_players.toArray(), db.score_entries.toArray(),
  ]);
  const gameName = new Map(games.map((g) => [g.id, g.name]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const liveSessions = new Map(sessions.filter(live).map((s) => [s.id, s]));
  const liveSeats = seats.filter((x) => live(x) && liveSessions.has(x.session_id));

  const results = liveSeats
    .filter((x) => liveSessions.get(x.session_id)!.status === 'finished')
    .map((x) => {
      const s = liveSessions.get(x.session_id)!;
      return {
        session_id: s.id,
        game_name: gameName.get(s.game_id) ?? '',
        started_at: s.started_at,
        ended_at: s.ended_at,
        player_name: playerName.get(x.player_id) ?? '',
        team_name: x.team_id ? teamName.get(x.team_id) ?? '' : '',
        final_score: x.final_score,
        placement: x.placement,
        is_winner: !!x.is_winner,
        player_count: liveSeats.filter((y) => y.session_id === s.id).length,
      };
    });

  const entryRows = entries
    .filter((e) => live(e) && liveSessions.has(e.session_id))
    .map((e) => {
      const s = liveSessions.get(e.session_id)!;
      return {
        session_id: s.id,
        game_name: gameName.get(s.game_id) ?? '',
        started_at: s.started_at,
        player_name: e.player_id ? playerName.get(e.player_id) ?? '' : '',
        team_name: e.team_id ? teamName.get(e.team_id) ?? '' : '',
        round_no: e.round_no,
        category: e.category,
        points: e.points,
      };
    });

  return { results, entries: entryRows };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/db`
Expected: PASS (all db tests).

- [ ] **Step 9: Commit**

```bash
git add src/db src/stats tests/db
git commit -m "feat: Dexie schema, outbox-backed save() and session actions"
```

---

### Task 6: Sync engine (push / pull)

**Files:**
- Create: `src/sync/sync.ts`, `src/sync/runner.ts`
- Test: `tests/sync/sync.test.ts`, `tests/sync/runner.test.ts`

**Interfaces:**
- Consumes: `db`, `SYNC_TABLES`, `TableName`, `BaseRow` (Task 5).
- Produces:
  - `interface RemoteClient { userId(): Promise<string | null>; upsert(table: TableName, rows: BaseRow[]): Promise<string | null>; fetchSince(table: TableName, since: string | null): Promise<{ rows: BaseRow[]; error: string | null }> }` — `upsert` returns an error message or `null`.
  - `PULL_PAGE = 1000`
  - `push(client: RemoteClient): Promise<{ pushed: number; error: string | null }>`
  - `pull(client: RemoteClient): Promise<{ pulled: number; error: string | null }>`
  - `nextDelay(failures: number): number`
  - `type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out'`, `interface SyncStatus { state: SyncState; pending: number; lastError: string | null }`
  - `getStatus(): SyncStatus`, `subscribe(fn: (s: SyncStatus) => void): () => void`, `syncNow(): Promise<void>`, `requestSync(delay?: number): void`, `startSyncLoop(client: RemoteClient): void`

- [ ] **Step 1: Write the failing tests**

`tests/sync/sync.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, ensureBuiltInGames, startSession } from '../../src/db/actions';
import { db, type BaseRow, type TableName } from '../../src/db/schema';
import { pull, push, type RemoteClient } from '../../src/sync/sync';

function fakeRemote(uid: string | null = 'user-1') {
  const tables = new Map<string, Map<string, BaseRow>>();
  const calls: { table: TableName; rows: BaseRow[] }[] = [];
  let failWith: string | null = null;
  const client: RemoteClient = {
    async userId() { return uid; },
    async upsert(table, rows) {
      if (failWith) return failWith;
      calls.push({ table, rows });
      const t = tables.get(table) ?? new Map<string, BaseRow>();
      for (const r of rows) t.set(r.id, structuredClone(r));
      tables.set(table, t);
      return null;
    },
    async fetchSince(table, since) {
      const rows = [...(tables.get(table)?.values() ?? [])]
        .filter((r) => !since || r.updated_at >= since)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      return { rows: rows.map((r) => structuredClone(r)), error: null };
    },
  };
  return { client, tables, calls, fail: (msg: string | null) => { failWith = msg; } };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureBuiltInGames();
});

describe('push', () => {
  it('does nothing when signed out', async () => {
    await addPlayer('Anna');
    const r = fakeRemote(null);
    expect(await push(r.client)).toEqual({ pushed: 0, error: null });
    expect(await db.outbox.count()).toBe(1);
  });

  it('sends rows in FK order with owner_id and clears the outbox', async () => {
    const a = await addPlayer('Anna');
    const b = await addPlayer('Bo');
    await startSession('00000000-0000-4000-8000-000000000002', {}, [
      { playerId: a.id, teamIndex: null }, { playerId: b.id, teamIndex: null },
    ], []);
    const r = fakeRemote();
    const res = await push(r.client);
    expect(res.error).toBeNull();
    expect(r.calls.map((c) => c.table)).toEqual(['players', 'sessions', 'session_players']);
    expect(r.calls[0].rows.every((row) => row.owner_id === 'user-1')).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.players.get(a.id))!.owner_id).toBe('user-1');
  });

  it('keeps the outbox when the server fails', async () => {
    await addPlayer('Anna');
    const r = fakeRemote();
    r.fail('netværksfejl');
    expect(await push(r.client)).toEqual({ pushed: 0, error: 'netværksfejl' });
    expect(await db.outbox.count()).toBe(1);
  });

  it('never pushes built-in games', async () => {
    await db.outbox.add({ table: 'games', row_id: '00000000-0000-4000-8000-000000000001' });
    const r = fakeRemote();
    await push(r.client);
    expect(r.calls).toEqual([]);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('pull', () => {
  it('restores rows into an empty device without queueing them', async () => {
    const r = fakeRemote();
    const remoteRow = {
      id: 'p1', owner_id: 'user-1', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
      deleted_at: null, name: 'Anna', archived: false,
    };
    await r.client.upsert('players', [remoteRow]);
    const res = await pull(r.client);
    expect(res).toEqual({ pulled: 1, error: null });
    expect((await db.players.get('p1'))!.name).toBe('Anna');
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the local row when it is newer', async () => {
    const local = await addPlayer('Anna lokal');
    await db.outbox.clear();
    const r = fakeRemote();
    await r.client.upsert('players', [{ ...local, name: 'Anna gammel', updated_at: '2000-01-01T00:00:00.000Z' } as BaseRow]);
    await pull(r.client);
    expect((await db.players.get(local.id))!.name).toBe('Anna lokal');
  });

  it('remembers how far it has pulled', async () => {
    const r = fakeRemote();
    await r.client.upsert('players', [{
      id: 'p1', owner_id: 'user-1', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z', deleted_at: null,
    }]);
    await pull(r.client);
    expect((await db.meta.get('pulled_at:players'))!.value).toBe('2026-10-01T10:00:00.000Z');
  });
});
```

`tests/sync/runner.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sync`
Expected: FAIL — cannot resolve `../../src/sync/sync` / `runner`.

- [ ] **Step 3: Implement `src/sync/sync.ts`**

```ts
import { db, SYNC_TABLES, type BaseRow, type TableName } from '../db/schema';

export interface RemoteClient {
  userId(): Promise<string | null>;
  /** Returns an error message, or null on success. */
  upsert(table: TableName, rows: BaseRow[]): Promise<string | null>;
  fetchSince(table: TableName, since: string | null): Promise<{ rows: BaseRow[]; error: string | null }>;
}

export const PULL_PAGE = 1000;

const isBuiltIn = (table: TableName, row: BaseRow) => table === 'games' && (row as BaseRow & { built_in?: boolean }).built_in === true;

export async function push(client: RemoteClient): Promise<{ pushed: number; error: string | null }> {
  const uid = await client.userId();
  if (!uid) return { pushed: 0, error: null };
  const pending = await db.outbox.orderBy('seq').toArray();
  let pushed = 0;
  for (const table of SYNC_TABLES) {
    const items = pending.filter((p) => p.table === table);
    if (!items.length) continue;
    const ids = [...new Set(items.map((i) => i.row_id))];
    const rows = (await db.table(table).bulkGet(ids)).filter((r): r is BaseRow => !!r);
    const toSend = rows.filter((r) => !isBuiltIn(table, r)).map((r) => ({ ...r, owner_id: uid }));
    if (toSend.length) {
      const error = await client.upsert(table, toSend);
      if (error) return { pushed, error };
    }
    await db.transaction('rw', db.outbox, db.table(table), async () => {
      await db.outbox.bulkDelete(items.map((i) => i.seq!));
      for (const r of toSend) await db.table(table).update(r.id, { owner_id: uid });
    });
    pushed += toSend.length;
  }
  return { pushed, error: null };
}

export async function pull(client: RemoteClient): Promise<{ pulled: number; error: string | null }> {
  const uid = await client.userId();
  if (!uid) return { pulled: 0, error: null };
  let pulled = 0;
  for (const table of SYNC_TABLES) {
    const metaKey = `pulled_at:${table}`;
    let since = (await db.meta.get(metaKey))?.value ?? null;
    for (;;) {
      const { rows, error } = await client.fetchSince(table, since);
      if (error) return { pulled, error };
      await db.transaction('rw', db.table(table), async () => {
        for (const remote of rows) {
          if (isBuiltIn(table, remote)) continue;
          const local = (await db.table(table).get(remote.id)) as BaseRow | undefined;
          if (!local || local.updated_at < remote.updated_at) {
            await db.table(table).put(remote);
            pulled++;
          }
        }
      });
      const newest = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), since);
      if (newest) await db.meta.put({ key: metaKey, value: newest });
      if (rows.length < PULL_PAGE || newest === since) break;
      since = newest;
    }
  }
  return { pulled, error: null };
}
```

- [ ] **Step 4: Implement `src/sync/runner.ts`**

```ts
import { liveQuery } from 'dexie';
import { db } from '../db/schema';
import { pull, push, type RemoteClient } from './sync';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastError: string | null;
}

export function nextDelay(failures: number): number {
  return failures === 0 ? 60_000 : Math.min(5_000 * 2 ** (failures - 1), 300_000);
}

let status: SyncStatus = { state: 'idle', pending: 0, lastError: null };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getStatus(): SyncStatus {
  return status;
}

export function subscribe(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let client: RemoteClient | null = null;
let running = false;
let failures = 0;
let loopTimer: ReturnType<typeof setTimeout> | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  clearTimeout(loopTimer);
  loopTimer = setTimeout(syncNow, nextDelay(failures));
}

export async function syncNow(): Promise<void> {
  if (!client || running) return;
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    schedule();
    return;
  }
  running = true;
  setStatus({ state: 'syncing' });
  try {
    if (!(await client.userId())) {
      failures = 0;
      setStatus({ state: 'signed-out', lastError: null });
      return;
    }
    const pushed = await push(client);
    const result = pushed.error ? pushed : await pull(client);
    if (result.error) {
      failures++;
      setStatus({ state: 'error', lastError: result.error });
    } else {
      failures = 0;
      setStatus({ state: 'idle', lastError: null });
    }
  } catch (e) {
    failures++;
    setStatus({ state: 'error', lastError: String(e) });
  } finally {
    running = false;
    schedule();
  }
}

export function requestSync(delay = 2_000): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncNow, delay);
}

export function startSyncLoop(c: RemoteClient): void {
  client = c;
  liveQuery(() => db.outbox.count()).subscribe((n) => {
    const grew = n > status.pending;
    setStatus({ pending: n });
    if (grew) requestSync();
  });
  window.addEventListener('online', () => requestSync(0));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(0);
  });
  requestSync(0);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/sync`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sync tests/sync
git commit -m "feat: outbox push, incremental pull and sync runner with backoff"
```

---

### Task 7: Supabase schema, client adapter and OTP login

**Files:**
- Create: `supabase/migrations/001_init.sql`, `supabase/migrations/002_powerbi_reader.sql`, `src/sync/supabaseClient.ts`, `src/sync/auth.ts`
- Test: `tests/sync/normalize.test.ts`

**Interfaces:**
- Consumes: `RemoteClient` (Task 6), `BaseRow`, `TableName` (Task 5).
- Produces:
  - `supabase` (supabase-js client), `remote: RemoteClient`, `normalizeRow(row: Record<string, unknown>): BaseRow`
  - `sendCode(email: string): Promise<string | null>`, `verifyCode(email: string, token: string): Promise<string | null>`, `signOut(): Promise<void>`, `onAuthChange(cb: (email: string | null) => void): () => void`

- [ ] **Step 1: Write `supabase/migrations/001_init.sql`**

```sql
-- Spilscore: schema, RLS, grants, results view, built-in games.
-- Run once in Supabase → SQL Editor.

create table public.players (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  archived boolean not null default false
);

create table public.games (
  id uuid primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  key text not null,
  name text not null,
  type text not null check (type in ('open_rounds', 'fixed_rounds', 'scoresheet', 'result_only')),
  config jsonb not null,
  built_in boolean not null default false
);

create table public.sessions (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  game_id uuid not null references public.games(id),
  options jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('in_progress', 'finished', 'abandoned')),
  note text
);

create table public.session_teams (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  name text not null,
  seat int not null
);

create table public.session_players (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  player_id uuid not null references public.players(id),
  team_id uuid references public.session_teams(id),
  seat int not null,
  final_score numeric,
  placement int,
  is_winner boolean
);

create table public.score_entries (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  player_id uuid references public.players(id),
  team_id uuid references public.session_teams(id),
  round_no int,
  category text,
  points numeric not null,
  check ((player_id is null) <> (team_id is null))
);

create index on public.players (owner_id, updated_at);
create index on public.games (owner_id, updated_at);
create index on public.sessions (owner_id, updated_at);
create index on public.session_teams (owner_id, updated_at);
create index on public.session_players (owner_id, updated_at);
create index on public.score_entries (owner_id, updated_at);
create index on public.session_players (session_id);
create index on public.score_entries (session_id);

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.sessions enable row level security;
alter table public.session_teams enable row level security;
alter table public.session_players enable row level security;
alter table public.score_entries enable row level security;

create policy own_rows on public.players for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.sessions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.session_teams for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.session_players for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.score_entries for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy read_games on public.games for select to anon, authenticated
  using (built_in or owner_id = (select auth.uid()));
create policy insert_own_games on public.games for insert to authenticated
  with check (owner_id = (select auth.uid()) and not built_in);
create policy update_own_games on public.games for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and not built_in);

grant select, insert, update on
  public.players, public.games, public.sessions, public.session_teams, public.session_players, public.score_entries
  to authenticated;
grant select on public.games to anon;

create view public.v_results with (security_invoker = true) as
select
  s.id as session_id,
  g.name as game_name,
  s.started_at,
  s.ended_at,
  p.name as player_name,
  t.name as team_name,
  sp.final_score,
  sp.placement,
  sp.is_winner,
  count(*) over (partition by s.id) as player_count
from public.session_players sp
join public.sessions s on s.id = sp.session_id
join public.games g on g.id = s.game_id
join public.players p on p.id = sp.player_id
left join public.session_teams t on t.id = sp.team_id
where s.status = 'finished' and s.deleted_at is null and sp.deleted_at is null;

grant select on public.v_results to authenticated;

insert into public.games (id, owner_id, created_at, updated_at, key, name, type, config, built_in) values
  ('00000000-0000-4000-8000-000000000001', null, now(), now(), 'yatzy', 'Yatzy', 'scoresheet', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000002', null, now(), now(), '500', '500', 'open_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000003', null, now(), now(), 'flip7', 'Flip 7', 'open_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000004', null, now(), now(), 'davoserjas', 'Davoserjas', 'fixed_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000005', null, now(), now(), 'hitster', 'Hitster', 'result_only', '{}'::jsonb, true);
```

- [ ] **Step 2: Write `supabase/migrations/002_powerbi_reader.sql`** (run later, when connecting Power BI)

```sql
-- Read-only login for Power BI. Replace the password before running; never commit the real one.
create role powerbi_reader login password 'SKIFT-MIG-FØR-KØRSEL';
grant usage on schema public to powerbi_reader;
grant select on
  public.players, public.games, public.sessions, public.session_teams,
  public.session_players, public.score_entries, public.v_results
  to powerbi_reader;

create policy powerbi_read on public.players for select to powerbi_reader using (true);
create policy powerbi_read on public.games for select to powerbi_reader using (true);
create policy powerbi_read on public.sessions for select to powerbi_reader using (true);
create policy powerbi_read on public.session_teams for select to powerbi_reader using (true);
create policy powerbi_read on public.session_players for select to powerbi_reader using (true);
create policy powerbi_read on public.score_entries for select to powerbi_reader using (true);
```

- [ ] **Step 3: Write the failing test**

`tests/sync/normalize.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { normalizeRow } = await import('../../src/sync/supabaseClient');

describe('normalizeRow', () => {
  it('rewrites Postgres timestamps to JS ISO strings so string comparison works', () => {
    const row = normalizeRow({
      id: 'x', owner_id: 'u', created_at: '2026-10-09T12:00:00.123+00:00',
      updated_at: '2026-10-09T12:00:00.5+00:00', deleted_at: null, ended_at: null,
    });
    expect(row.created_at).toBe('2026-10-09T12:00:00.123Z');
    expect(row.updated_at).toBe('2026-10-09T12:00:00.500Z');
    expect(row.deleted_at).toBeNull();
  });

  it('turns numeric strings in numeric columns into numbers', () => {
    const row = normalizeRow({ id: 'x', points: '12', final_score: '7.5' }) as unknown as Record<string, unknown>;
    expect(row.points).toBe(12);
    expect(row.final_score).toBe(7.5);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- tests/sync/normalize.test.ts`
Expected: FAIL — cannot resolve `../../src/sync/supabaseClient`.

- [ ] **Step 5: Implement `src/sync/supabaseClient.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import type { BaseRow } from '../db/schema';
import { PULL_PAGE, type RemoteClient } from './sync';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'started_at', 'ended_at'];
const NUMERIC_COLUMNS = ['points', 'final_score'];

export function normalizeRow(row: Record<string, unknown>): BaseRow {
  const out: Record<string, unknown> = { ...row };
  for (const c of TIMESTAMP_COLUMNS) {
    if (typeof out[c] === 'string') out[c] = new Date(out[c] as string).toISOString();
  }
  for (const c of NUMERIC_COLUMNS) {
    if (typeof out[c] === 'string') out[c] = Number(out[c]);
  }
  return out as unknown as BaseRow;
}

export const remote: RemoteClient = {
  async userId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },
  async upsert(table, rows) {
    const { error } = await supabase.from(table).upsert(rows);
    return error ? error.message : null;
  },
  async fetchSince(table, since) {
    let q = supabase.from(table).select('*').order('updated_at').limit(PULL_PAGE);
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q;
    return { rows: (data ?? []).map(normalizeRow), error: error ? error.message : null };
  },
};
```

- [ ] **Step 6: Implement `src/sync/auth.ts`**

```ts
import { supabase } from './supabaseClient';

/** Sends a 6-digit code by email. Returns an error message or null. */
export async function sendCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? error.message : null;
}

export async function verifyCode(email: string, token: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Calls cb immediately with the current user's email (or null) and on every change. */
export function onAuthChange(cb: (email: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null));
  return () => data.subscription.unsubscribe();
}
```

- [ ] **Step 7: Run tests and build**

Run: `npm test -- tests/sync`
Expected: PASS.

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Supabase setup (Frederik, in the browser)**

1. Supabase → SQL Editor → paste `supabase/migrations/001_init.sql` → Run. Expected: "Success. No rows returned".
2. Authentication → Emails → "Magic Link" template: make the body contain `Din kode: {{ .Token }}`. Save.
3. Verify from a terminal (expects 5 built-in games as JSON):

```bash
curl -s "https://qskvbsjjqmpdtwlefxjx.supabase.co/rest/v1/games?select=key" -H "apikey: sb_publishable_PMGHWEQ_Qke3j6nIUKremg_hVo_xP8v"
```

- [ ] **Step 9: Commit**

```bash
git add supabase src/sync tests/sync
git commit -m "feat: Supabase schema with RLS, client adapter and email OTP login"
```

---

### Task 8: Statistics

**Files:**
- Modify: `src/stats/stats.ts` (keep the `ResultRow` interface from Task 5)
- Test: `tests/stats/stats.test.ts`

**Interfaces:**
- Consumes: `ResultRow` (Task 5), `Scoring` (Task 2).
- Produces:
  - `interface PlayerSummary { playerId: string; played: number; wins: number; winRate: number }`
  - `summarize(rows: ResultRow[]): PlayerSummary[]` — sorted by winRate desc, then played desc.
  - `longestWinStreak(rows: ResultRow[], playerId: string): number`
  - `headToHead(rows: ResultRow[], a: string, b: string): { games: number; aWins: number; bWins: number }` — "win" = better placement than the other.
  - `scoreSummary(rows: ResultRow[], scoring: Scoring): { avg: number | null; best: number | null; worst: number | null }`
  - `favoriteGame(rows: ResultRow[], playerId: string): string | null` — most played gameId.
  - `maxRoundScore(entries: { player_id: string | null; points: number }[]): { playerId: string; points: number } | null`

- [ ] **Step 1: Write the failing test**

`tests/stats/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  favoriteGame, headToHead, longestWinStreak, maxRoundScore, scoreSummary, summarize, type ResultRow,
} from '../../src/stats/stats';

const row = (sessionId: string, gameId: string, playerId: string, endedAt: string, placement: number, finalScore: number | null = null): ResultRow => ({
  sessionId, gameId, playerId, endedAt, placement, finalScore, isWinner: placement === 1,
});

const rows: ResultRow[] = [
  row('s1', 'g1', 'A', '2026-01-01', 1, 300), row('s1', 'g1', 'B', '2026-01-01', 2, 200),
  row('s2', 'g1', 'A', '2026-01-02', 2, 100), row('s2', 'g1', 'B', '2026-01-02', 1, 500),
  row('s3', 'g1', 'A', '2026-01-03', 1, 400), row('s3', 'g1', 'B', '2026-01-03', 2, 250), row('s3', 'g1', 'C', '2026-01-03', 3, 50),
  row('s4', 'g2', 'A', '2026-01-04', 1), row('s4', 'g2', 'B', '2026-01-04', 1),
];

describe('summarize', () => {
  it('counts games, wins (shared wins count) and win rate', () => {
    expect(summarize(rows)).toEqual([
      { playerId: 'A', played: 4, wins: 3, winRate: 0.75 },
      { playerId: 'B', played: 4, wins: 2, winRate: 0.5 },
      { playerId: 'C', played: 1, wins: 0, winRate: 0 },
    ]);
  });
});

describe('longestWinStreak', () => {
  it('follows the chronological order of the player own games', () => {
    expect(longestWinStreak(rows, 'A')).toBe(2);
    expect(longestWinStreak(rows, 'C')).toBe(0);
  });
});

describe('headToHead', () => {
  it('compares placements in shared games; ties count for nobody', () => {
    expect(headToHead(rows, 'A', 'B')).toEqual({ games: 4, aWins: 2, bWins: 1 });
    expect(headToHead(rows, 'A', 'C')).toEqual({ games: 1, aWins: 1, bWins: 0 });
  });
});

describe('scoreSummary', () => {
  const g1 = rows.filter((r) => r.gameId === 'g1');
  it('uses high as best for high-scoring games', () => {
    expect(scoreSummary(g1, 'high')).toEqual({ avg: 1800 / 7, best: 500, worst: 50 });
  });
  it('flips best/worst for low-scoring games', () => {
    expect(scoreSummary(g1, 'low')).toMatchObject({ best: 50, worst: 500 });
  });
  it('returns nulls when there are no scores', () => {
    expect(scoreSummary(rows.filter((r) => r.gameId === 'g2'), 'high')).toEqual({ avg: null, best: null, worst: null });
  });
});

describe('favoriteGame', () => {
  it('returns the most played game', () => {
    expect(favoriteGame(rows, 'A')).toBe('g1');
    expect(favoriteGame(rows, 'nobody')).toBeNull();
  });
});

describe('maxRoundScore', () => {
  it('finds the highest single entry', () => {
    expect(maxRoundScore([{ player_id: 'A', points: 40 }, { player_id: 'B', points: 95 }])).toEqual({ playerId: 'B', points: 95 });
    expect(maxRoundScore([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/stats`
Expected: FAIL — `summarize` (and others) not exported.

- [ ] **Step 3: Implement — replace `src/stats/stats.ts` with**

```ts
import type { Scoring } from '../games/types';

export interface ResultRow {
  sessionId: string;
  gameId: string;
  playerId: string;
  endedAt: string;
  finalScore: number | null;
  placement: number | null;
  isWinner: boolean;
}

export interface PlayerSummary {
  playerId: string;
  played: number;
  wins: number;
  winRate: number;
}

export function summarize(rows: ResultRow[]): PlayerSummary[] {
  const by = new Map<string, { played: number; wins: number }>();
  for (const r of rows) {
    const s = by.get(r.playerId) ?? { played: 0, wins: 0 };
    s.played++;
    if (r.isWinner) s.wins++;
    by.set(r.playerId, s);
  }
  return [...by.entries()]
    .map(([playerId, s]) => ({ playerId, ...s, winRate: s.played ? s.wins / s.played : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played);
}

export function longestWinStreak(rows: ResultRow[], playerId: string): number {
  const own = rows.filter((r) => r.playerId === playerId).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  let best = 0;
  let current = 0;
  for (const r of own) {
    current = r.isWinner ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function headToHead(rows: ResultRow[], a: string, b: string): { games: number; aWins: number; bWins: number } {
  const bySession = new Map<string, { a?: ResultRow; b?: ResultRow }>();
  for (const r of rows) {
    if (r.playerId !== a && r.playerId !== b) continue;
    const s = bySession.get(r.sessionId) ?? {};
    if (r.playerId === a) s.a = r;
    else s.b = r;
    bySession.set(r.sessionId, s);
  }
  let games = 0;
  let aWins = 0;
  let bWins = 0;
  for (const { a: ra, b: rb } of bySession.values()) {
    if (!ra || !rb || ra.placement === null || rb.placement === null) continue;
    games++;
    if (ra.placement < rb.placement) aWins++;
    else if (rb.placement < ra.placement) bWins++;
  }
  return { games, aWins, bWins };
}

export function scoreSummary(rows: ResultRow[], scoring: Scoring): { avg: number | null; best: number | null; worst: number | null } {
  const scores = rows.map((r) => r.finalScore).filter((s): s is number => s !== null);
  if (!scores.length) return { avg: null, best: null, worst: null };
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return {
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    best: scoring === 'high' ? max : min,
    worst: scoring === 'high' ? min : max,
  };
}

export function favoriteGame(rows: ResultRow[], playerId: string): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.playerId === playerId) counts.set(r.gameId, (counts.get(r.gameId) ?? 0) + 1);
  let best: string | null = null;
  for (const [g, n] of counts) if (best === null || n > counts.get(best)!) best = g;
  return best;
}

export function maxRoundScore(entries: { player_id: string | null; points: number }[]): { playerId: string; points: number } | null {
  let best: { playerId: string; points: number } | null = null;
  for (const e of entries) {
    if (e.player_id && (!best || e.points > best.points)) best = { playerId: e.player_id, points: e.points };
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stats tests/stats
git commit -m "feat: win rates, streaks, head-to-head and score statistics"
```

---

### Task 9: App shell, Home, Settings (login, players, export)

**Files:**
- Create: `src/ui/router.ts`, `src/ui/useLive.ts`, `src/ui/points.ts`, `src/ui/styles.css`, `src/ui/SyncBadge.tsx`, `src/ui/SessionList.tsx`, `src/ui/LoginForm.tsx`, `src/ui/PlayersEditor.tsx`, `src/ui/screens/Home.tsx`, `src/ui/screens/Settings.tsx`, `src/export/csv.ts`
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `tests/ui/router.test.ts`, `tests/ui/points.test.ts`, `tests/export/csv.test.ts`

**Interfaces:**
- Consumes: `db`, actions (`ensureBuiltInGames`, `addPlayer`, `updatePlayer`), `loadSessionSummaries`, `loadExportRows`, `SessionSummary` (Task 5); `startSyncLoop`, `requestSync`, `getStatus`, `subscribe` (Task 6); `remote`, `sendCode`, `verifyCode`, `signOut`, `onAuthChange` (Task 7).
- Produces:
  - `type Route = { name: 'home' } | { name: 'new' } | { name: 'play'; id: string } | { name: 'history' } | { name: 'stats' } | { name: 'settings' }`
  - `parseRoute(hash: string): Route`, `href(r: Route): string`, `navigate(r: Route): void`, `useRoute(): Route`
  - `useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined`
  - `parsePoints(text: string, negative: boolean): number | null`
  - `formatDate(iso: string): string`
  - `toCsv(rows: Record<string, unknown>[], sep?: string): string`, `shareOrDownload(filename: string, csv: string): Promise<void>`
  - `<SessionList items={SessionSummary[]} />`
  - CSS classes: `card`, `row`, `grid2`, `chips`, `chip`, `chip.on`, `muted`, `warn`, `win`, `score` (table), `overlay`, `sheet`, `badge`, `primary`, `big`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/router.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { href, parseRoute } from '../../src/ui/router';

describe('router', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/new', { name: 'new' }],
    ['#/play/abc-123', { name: 'play', id: 'abc-123' }],
    ['#/play', { name: 'home' }],
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
```

`tests/ui/points.test.ts`:
```ts
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
```

`tests/export/csv.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui tests/export`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement `src/ui/router.ts`, `src/ui/points.ts`, `src/ui/useLive.ts`, `src/export/csv.ts`**

`src/ui/router.ts`:
```ts
import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'play'; id: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [, first, second] = hash.replace(/^#/, '').split('/');
  switch (first) {
    case 'new':
    case 'history':
    case 'stats':
    case 'settings':
      return { name: first };
    case 'play':
      return second ? { name: 'play', id: second } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

export function href(r: Route): string {
  if (r.name === 'home') return '#/';
  if (r.name === 'play') return `#/play/${r.id}`;
  return `#/${r.name}`;
}

export function navigate(r: Route): void {
  location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

`src/ui/points.ts`:
```ts
export function parsePoints(text: string, negative: boolean): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return negative && n !== 0 ? -n : n;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}
```

`src/ui/useLive.ts`:
```ts
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Re-runs the Dexie query whenever the tables it reads change. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: (v) => setValue(() => v), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
```

`src/export/csv.ts`:
```ts
const FORMULA_START = /^[=+\-@]/;

function cell(v: unknown, sep: string): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA_START.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated so Danish Excel opens it directly. */
export function toCsv(rows: Record<string, unknown>[], sep = ';'): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(sep), ...rows.map((r) => cols.map((c) => cell(r[c], sep)).join(sep))].join('\r\n');
}

/** iOS home-screen apps handle the share sheet better than downloads; fall back to a download link. */
export async function shareOrDownload(filename: string, csv: string): Promise<void> {
  const file = new File(['﻿' + csv], filename, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui tests/export`
Expected: PASS.

- [ ] **Step 5: Write `src/ui/styles.css`**

```css
:root {
  --bg: #f6f6f4;
  --surface: #ffffff;
  --text: #16181d;
  --muted: #6b7080;
  --border: #dcdde2;
  --accent: #2f6fed;
  --accent-text: #ffffff;
  --warn: #8a4500;
  --warn-bg: #fff3e0;
  --win: #1f7a43;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --surface: #1d2026;
    --text: #eceef2;
    --muted: #9aa0ad;
    --border: #2e323b;
    --accent: #5b8cff;
    --accent-text: #0b0d10;
    --warn: #ffb35c;
    --warn-bg: #3a2a14;
    --win: #4cc982;
  }
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-text-size-adjust: 100%;
}
#app { min-height: 100dvh; }
header.top {
  position: sticky; top: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: calc(env(safe-area-inset-top) + 8px) 16px 8px;
  background: var(--bg); border-bottom: 1px solid var(--border);
}
main { padding: 16px; padding-bottom: calc(env(safe-area-inset-bottom) + 88px); max-width: 720px; margin: 0 auto; }
nav.bottom {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 10;
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: var(--surface); border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
nav.bottom a { min-height: 56px; display: flex; align-items: center; justify-content: center; color: var(--muted); text-decoration: none; font-size: 15px; }
nav.bottom a.active { color: var(--accent); font-weight: 600; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 19px; margin: 20px 0 10px; }
button {
  min-height: 44px; padding: 10px 16px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit;
}
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
button.big { width: 100%; min-height: 56px; font-size: 19px; }
button:disabled { opacity: 0.45; }
input, select {
  min-height: 44px; padding: 8px 12px; border-radius: 10px; width: 100%;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit;
}
input[type='checkbox'] { width: auto; min-height: 0; }
a.card { display: block; text-decoration: none; color: inherit; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-height: 44px; padding: 8px 14px; border-radius: 999px; }
.chip.on { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.muted { color: var(--muted); }
.warn { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: 10px 12px; }
.win { color: var(--win); font-weight: 700; }
.badge { font-size: 14px; color: var(--muted); }
.scroll-x { overflow-x: auto; }
table.score { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
table.score th, table.score td { padding: 10px 6px; text-align: center; border-bottom: 1px solid var(--border); }
table.score th:first-child, table.score td:first-child { text-align: left; }
table.score tr.total td { font-weight: 700; }
table.score tr.tap { cursor: pointer; }
.overlay { position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; }
.sheet {
  background: var(--bg); width: 100%; max-height: 85dvh; overflow: auto;
  border-radius: 18px 18px 0 0; padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px);
}
.stack > * + * { margin-top: 8px; }
```

- [ ] **Step 6: Write the shared components**

`src/ui/SyncBadge.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { getStatus, subscribe, type SyncStatus } from '../sync/runner';

function label(s: SyncStatus): string {
  const waiting = s.pending ? ` · ${s.pending} venter` : '';
  switch (s.state) {
    case 'signed-out':
      return `Ikke logget ind${waiting}`;
    case 'offline':
      return `Offline${waiting}`;
    case 'error':
      return `⚠ Sync fejlede${waiting}`;
    case 'syncing':
      return '⟳ Synkroniserer';
    default:
      return s.pending ? `⟳${waiting}` : '✓ Synkroniseret';
  }
}

export function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getStatus());
  useEffect(() => subscribe(setS), []);
  return <span class="badge" title={s.lastError ?? ''}>{label(s)}</span>;
}
```

`src/ui/SessionList.tsx`:
```tsx
import type { SessionSummary } from '../db/queries';
import { formatDate } from './points';
import { href } from './router';

const STATUS: Record<string, string> = { in_progress: 'I gang', finished: '', abandoned: 'Afbrudt' };

export function SessionList({ items }: { items: SessionSummary[] }) {
  if (!items.length) return <p class="muted">Ingen spil endnu.</p>;
  return (
    <>
      {items.map((s) => (
        <a key={s.session.id} class="card" href={href({ name: 'play', id: s.session.id })}>
          <div class="row" style="justify-content:space-between">
            <strong>{s.gameName}</strong>
            <span class="muted">{formatDate(s.session.started_at)}</span>
          </div>
          <div class="muted">{s.players.join(', ')}</div>
          {s.winners.length > 0 && <div class="win">Vinder: {s.winners.join(' og ')}</div>}
          {STATUS[s.session.status] && <div class="muted">{STATUS[s.session.status]}</div>}
        </a>
      ))}
    </>
  );
}
```

`src/ui/LoginForm.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { onAuthChange, sendCode, signOut, verifyCode } from '../sync/auth';

export function LoginForm() {
  const [user, setUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => onAuthChange(setUser), []);

  if (user) {
    return (
      <div class="card stack">
        <div>Logget ind som <strong>{user}</strong>. Dine spil synkroniseres til skyen.</div>
        <button onClick={() => signOut()}>Log ud</button>
      </div>
    );
  }

  return (
    <div class="card stack">
      <p class="muted" style="margin:0">Log ind for at gemme dine spil i skyen. Appen virker også uden.</p>
      <input type="email" autoComplete="email" placeholder="Din e-mail" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      {!sent ? (
        <button
          class="primary"
          disabled={!email.includes('@')}
          onClick={async () => {
            const err = await sendCode(email);
            setMsg(err ?? 'Koden er sendt. Tjek din mail.');
            if (!err) setSent(true);
          }}
        >
          Send kode
        </button>
      ) : (
        <>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-cifret kode" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          <button
            class="primary"
            disabled={code.trim().length < 6}
            onClick={async () => {
              const err = await verifyCode(email, code);
              setMsg(err);
            }}
          >
            Log ind
          </button>
          <button onClick={() => { setSent(false); setCode(''); setMsg(null); }}>Send ny kode</button>
        </>
      )}
      {msg && <p class="muted" style="margin:0">{msg}</p>}
    </div>
  );
}
```

`src/ui/PlayersEditor.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { addPlayer, updatePlayer } from '../db/actions';
import { db } from '../db/schema';
import { useLive } from './useLive';

export function PlayersEditor() {
  const players = useLive(
    async () => (await db.players.toArray()).filter((p) => !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    [],
  );
  const [name, setName] = useState('');
  if (!players) return null;
  return (
    <div class="card stack">
      {players.map((p) => (
        <div key={p.id} class="row">
          <input
            value={p.name}
            style={p.archived ? 'opacity:.5' : ''}
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== p.name) updatePlayer(p, { name: v });
            }}
          />
          <button onClick={() => updatePlayer(p, { archived: !p.archived })}>{p.archived ? 'Gendan' : 'Arkivér'}</button>
        </div>
      ))}
      <div class="row">
        <input placeholder="Ny spiller" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button
          class="primary"
          disabled={!name.trim()}
          onClick={async () => {
            await addPlayer(name);
            setName('');
          }}
        >
          Tilføj
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the screens**

`src/ui/screens/Home.tsx`:
```tsx
import { loadSessionSummaries } from '../../db/queries';
import { href, navigate } from '../router';
import { SessionList } from '../SessionList';
import { useLive } from '../useLive';

export function Home() {
  const list = useLive(() => loadSessionSummaries(), []);
  if (!list) return null;
  const active = list.find((s) => s.session.status === 'in_progress');
  return (
    <>
      {active && (
        <a class="card" href={href({ name: 'play', id: active.session.id })}>
          <div class="muted">Spil i gang</div>
          <strong>Fortsæt {active.gameName}</strong>
          <div class="muted">{active.players.join(', ')}</div>
        </a>
      )}
      <button class="primary big" onClick={() => navigate({ name: 'new' })}>Nyt spil</button>
      <h2>Seneste spil</h2>
      <SessionList items={list.slice(0, 10)} />
    </>
  );
}
```

`src/ui/screens/Settings.tsx`:
```tsx
import { loadExportRows } from '../../db/queries';
import { shareOrDownload, toCsv } from '../../export/csv';
import { LoginForm } from '../LoginForm';
import { PlayersEditor } from '../PlayersEditor';

export function Settings() {
  return (
    <>
      <h2>Konto og sync</h2>
      <LoginForm />
      <h2>Spillere</h2>
      <PlayersEditor />
      <h2>Eksport</h2>
      <div class="card stack">
        <button
          onClick={async () => shareOrDownload('spilscore-resultater.csv', toCsv((await loadExportRows()).results))}
        >
          Resultater (CSV)
        </button>
        <button onClick={async () => shareOrDownload('spilscore-point.csv', toCsv((await loadExportRows()).entries))}>
          Alle indtastede point (CSV)
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 8: Replace `src/ui/App.tsx`**

```tsx
import { href, useRoute, type Route } from './router';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { SyncBadge } from './SyncBadge';

const TABS: { label: string; route: Route }[] = [
  { label: 'Hjem', route: { name: 'home' } },
  { label: 'Historik', route: { name: 'history' } },
  { label: 'Statistik', route: { name: 'stats' } },
  { label: 'Indstillinger', route: { name: 'settings' } },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'settings':
      return <Settings />;
    default:
      return <p class="muted">Kommer snart.</p>;
  }
}

export function App() {
  const route = useRoute();
  return (
    <>
      <header class="top">
        <h1>Spilscore</h1>
        <SyncBadge />
      </header>
      <main>
        <Screen route={route} />
      </main>
      <nav class="bottom">
        {TABS.map((t) => (
          <a key={t.label} href={href(t.route)} class={route.name === t.route.name ? 'active' : ''}>
            {t.label}
          </a>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 9: Replace `src/main.tsx`**

```tsx
import { render } from 'preact';
import { ensureBuiltInGames } from './db/actions';
import { onAuthChange } from './sync/auth';
import { requestSync, startSyncLoop } from './sync/runner';
import { remote } from './sync/supabaseClient';
import { App } from './ui/App';
import './ui/styles.css';

ensureBuiltInGames().finally(() => {
  render(<App />, document.getElementById('app')!);
  startSyncLoop(remote);
  onAuthChange(() => requestSync(0));
});
```

- [ ] **Step 10: Verify**

Run: `npm test` → all PASS. Run: `npm run build` → no errors.

Start the dev server (`preview_start` with name `spilscore`, then navigate to `http://localhost:5173/Spilscore/`), resize to the mobile preset and check:
- Home shows "Nyt spil" and "Ingen spil endnu."
- Settings: add players "Anna" and "Bo"; rename one; archive/restore works; the header shows "Ikke logget ind · N venter".
- Log in with the email OTP; the badge turns "✓ Synkroniseret"; the rows appear in Supabase → Table Editor → players.
- "Resultater (CSV)" produces a file (or share sheet) without errors in the console.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: app shell with sync badge, home, settings, login and CSV export"
```

---

### Task 10: New game screen

**Files:**
- Create: `src/ui/screens/NewGame.tsx`
- Modify: `src/ui/App.tsx` (add the `new` route)

**Interfaces:**
- Consumes: `db`, `gameDef`, `addPlayer`, `startSession` (Task 5); `startProblem` (Task 4); `useLive`, `navigate` (Task 9).
- Produces: route `new` renders `<NewGame />`; on start navigates to `{ name: 'play', id }`.

- [ ] **Step 1: Write `src/ui/screens/NewGame.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { addPlayer, gameDef, startSession } from '../../db/actions';
import { db } from '../../db/schema';
import { startProblem } from '../../games/validate';
import { navigate } from '../router';
import { useLive } from '../useLive';

export function NewGame() {
  const data = useLive(
    async () => ({
      games: (await db.games.toArray()).filter((g) => !g.deleted_at).sort((a, b) => Number(b.built_in) - Number(a.built_in) || a.name.localeCompare(b.name, 'da')),
      players: (await db.players.toArray()).filter((p) => !p.deleted_at && !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    }),
    [],
  );
  const [gameId, setGameId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, number>>({});
  const [seats, setSeats] = useState<string[]>([]);
  const [teamsOn, setTeamsOn] = useState(false);
  const [teamCount, setTeamCount] = useState(2);
  const [teamOf, setTeamOf] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const row = data.games.find((g) => g.id === gameId);
  const game = row ? gameDef(row) : null;
  const useTeams = !!game && (game.config.teams === 'required' || (game.config.teams === 'optional' && teamsOn));
  const team = (pid: string) => teamOf[pid] ?? seats.indexOf(pid) % teamCount;
  const teamSizes = useTeams ? Array.from({ length: teamCount }, (_, t) => seats.filter((p) => team(p) === t).length) : null;
  const problem = game ? startProblem(game, seats.length, teamSizes) : 'Vælg et spil';
  const name = (pid: string) => data.players.find((p) => p.id === pid)?.name ?? '?';

  function toggleSeat(pid: string) {
    setSeats((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  }

  async function start() {
    if (!game || problem) return;
    setBusy(true);
    const opts: Record<string, number> = {};
    for (const o of game.config.options ?? []) opts[o.key] = options[o.key] ?? o.default;
    const teamNames = useTeams ? Array.from({ length: teamCount }, (_, i) => `Hold ${i + 1}`) : [];
    const id = await startSession(game.id, opts, seats.map((pid) => ({ playerId: pid, teamIndex: useTeams ? team(pid) : null })), teamNames);
    navigate({ name: 'play', id });
  }

  return (
    <>
      <h2>Spil</h2>
      <div class="chips">
        {data.games.map((g) => (
          <button key={g.id} class={`chip ${g.id === gameId ? 'on' : ''}`} onClick={() => setGameId(g.id)}>
            {g.name}
          </button>
        ))}
      </div>

      {game?.config.options?.map((o) => (
        <div key={o.key}>
          <h2>{o.label}</h2>
          <div class="chips">
            {o.values.map((v) => (
              <button key={v} class={`chip ${(options[o.key] ?? o.default) === v ? 'on' : ''}`} onClick={() => setOptions({ ...options, [o.key]: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}

      <h2>Spillere <span class="muted">(rækkefølge = plads ved bordet)</span></h2>
      <div class="chips">
        {data.players.map((p) => {
          const seat = seats.indexOf(p.id);
          return (
            <button key={p.id} class={`chip ${seat >= 0 ? 'on' : ''}`} onClick={() => toggleSeat(p.id)}>
              {seat >= 0 ? `${seat + 1}. ` : ''}{p.name}
            </button>
          );
        })}
      </div>
      <div class="row" style="margin-top:8px">
        <input placeholder="Ny spiller" value={newName} onInput={(e) => setNewName(e.currentTarget.value)} />
        <button
          disabled={!newName.trim()}
          onClick={async () => {
            const p = await addPlayer(newName);
            setNewName('');
            setSeats((s) => [...s, p.id]);
          }}
        >
          Tilføj
        </button>
      </div>

      {game && game.config.teams !== 'none' && (
        <>
          <h2>Hold</h2>
          {game.config.teams === 'optional' && (
            <label class="row" style="margin-bottom:8px">
              <input type="checkbox" checked={teamsOn} onChange={(e) => setTeamsOn(e.currentTarget.checked)} /> Spil på hold
            </label>
          )}
          {useTeams && (
            <>
              <div class="chips" style="margin-bottom:8px">
                {[2, 3, 4].map((n) => (
                  <button key={n} class={`chip ${teamCount === n ? 'on' : ''}`} onClick={() => setTeamCount(n)}>
                    {n} hold
                  </button>
                ))}
              </div>
              <p class="muted">Tryk på en spiller for at skifte hold.</p>
              {Array.from({ length: teamCount }, (_, t) => (
                <div key={t} class="card">
                  <strong>Hold {t + 1}</strong>
                  <div class="chips" style="margin-top:8px">
                    {seats.filter((p) => team(p) === t).map((p) => (
                      <button key={p} class="chip" onClick={() => setTeamOf({ ...teamOf, [p]: (team(p) + 1) % teamCount })}>
                        {name(p)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div style="margin-top:20px">
        {problem && game && <p class="muted">{problem}</p>}
        <button class="primary big" disabled={!!problem || busy} onClick={start}>Start</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire the route in `src/ui/App.tsx`**

Add the import and a case to `Screen`:
```tsx
import { NewGame } from './screens/NewGame';
```
```tsx
    case 'new':
      return <NewGame />;
```

- [ ] **Step 3: Verify**

Run: `npm run build` → no errors.
In the dev preview (mobile preset): "Nyt spil" → choose Davoserjas → select 2 players → "Vælg mindst 3 spillere" is shown and Start is disabled → add a third player via "Ny spiller" (auto-selected, numbered 3) → Start navigates to `#/play/<id>` (shows "Kommer snart." until Task 11). Choose Hitster, tick "Spil på hold", tap a player to move them between teams; an empty team disables Start.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: new game screen with players, seat order, options and teams"
```

---

### Task 11: Play screen — rounds board (500, Flip 7, Davoserjas)

**Files:**
- Create: `src/ui/screens/Play.tsx`, `src/ui/RoundsBoard.tsx`, `src/ui/RoundEntry.tsx`, `src/ui/FinishPrompt.tsx`, `src/ui/ResultBanner.tsx`, `src/ui/SessionMenu.tsx`
- Modify: `src/ui/App.tsx` (add the `play` route)

**Interfaces:**
- Consumes: `loadSessionBundle`, `SessionBundle`, `saveRound`, `undoLastRound`, `finishSession`, `abandonSession`, `setNote`, `deleteSession` (Task 5); `isGameOver` (Task 4); `davoserjasSums`, `describeSums` (Task 4); `parsePoints` (Task 9).
- Produces:
  - `<Play id />` dispatching on `game.type`.
  - `<FinishPrompt bundle />`, `<ResultBanner bundle />`, `<SessionMenu bundle />` — reused by Tasks 12 and 13.
  - `Play.tsx` renders `<YatzySheet>` and `<ResultEntry>` placeholders until Tasks 12/13 replace them.

- [ ] **Step 1: Write the shared pieces**

`src/ui/FinishPrompt.tsx`:
```tsx
import { finishSession, type SessionBundle } from '../db/actions';
import { isGameOver } from '../games/results';

export function FinishPrompt({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, entries } = bundle;
  if (session.status !== 'in_progress' || !isGameOver(game, session.options, seats, entries)) return null;
  return (
    <div class="card stack">
      <strong>Spillet er slut</strong>
      <button class="primary big" onClick={() => finishSession(session.id)}>Afslut og gem</button>
    </div>
  );
}
```

`src/ui/ResultBanner.tsx`:
```tsx
import type { SessionBundle } from '../db/actions';

export function ResultBanner({ bundle }: { bundle: SessionBundle }) {
  const ranked = [...bundle.seats].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));
  return (
    <div class="card">
      {ranked.map((s) => (
        <div key={s.id} class={`row ${s.is_winner ? 'win' : ''}`} style="justify-content:space-between">
          <span>{s.placement}. {s.name}</span>
          <span>{s.final_score ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
```

`src/ui/SessionMenu.tsx`:
```tsx
import { abandonSession, deleteSession, finishSession, setNote, type SessionBundle } from '../db/actions';
import { navigate } from './router';

export function SessionMenu({ bundle }: { bundle: SessionBundle }) {
  const { session, game } = bundle;
  const inProgress = session.status === 'in_progress';
  return (
    <div class="row" style="flex-wrap:wrap;margin:8px 0 12px">
      <button onClick={() => { const n = prompt('Note til spillet', session.note ?? ''); if (n !== null) setNote(session.id, n); }}>
        Note
      </button>
      {inProgress && game.type !== 'result_only' && (
        <button onClick={() => { if (confirm('Afslut spillet nu med den nuværende stilling?')) finishSession(session.id); }}>Afslut nu</button>
      )}
      {inProgress && (
        <button onClick={() => { if (confirm('Afbryd spillet? Det tæller ikke med i statistikken.')) abandonSession(session.id); }}>Afbryd</button>
      )}
      <button
        onClick={async () => {
          if (!confirm('Slet spillet?')) return;
          await deleteSession(session.id);
          navigate({ name: 'home' });
        }}
      >
        Slet
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/ui/RoundEntry.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { saveRound, type SessionBundle } from '../db/actions';
import { davoserjasSums, describeSums } from '../games/davoserjas';
import { parsePoints } from './points';

export function RoundEntry({ bundle, roundNo, onClose }: { bundle: SessionBundle; roundNo: number; onClose: () => void }) {
  const { session, game, seats, entries } = bundle;
  const existing = (pid: string) => entries.find((e) => e.round_no === roundNo && e.player_id === pid);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(seats.map((s) => { const e = existing(s.player_id); return [s.player_id, e ? String(Math.abs(e.points)) : '']; })),
  );
  const [neg, setNeg] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seats.map((s) => [s.player_id, (existing(s.player_id)?.points ?? 0) < 0])),
  );
  const def = game.config.rounds?.[roundNo - 1];
  const parsed = seats.map((s) => parsePoints(values[s.player_id] ?? '', !!neg[s.player_id]));
  const complete = parsed.every((p) => p !== null);
  const sum = parsed.reduce<number>((a, p) => a + (p ?? 0), 0);
  const allowed = def?.check ? davoserjasSums(def.check, seats.length) : null;
  const sumWarning = allowed && complete && !allowed.includes(sum) ? `Summen er ${sum}, forventet ${describeSums(allowed)}.` : null;

  async function save() {
    await saveRound(session.id, roundNo, seats.map((s, i) => ({ playerId: s.player_id, points: parsed[i]! })), def?.key ?? null);
    onClose();
  }

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet stack">
        <h2 style="margin-top:0">{def ? `Runde ${roundNo}: ${def.label}` : `Runde ${roundNo}`}</h2>
        {def && <p class="muted" style="margin:0">{def.rule}</p>}
        {seats.map((s) => (
          <div key={s.player_id} class="row">
            <label style="flex:1">{s.name}</label>
            {game.config.bustButton && (
              <button onClick={() => { setValues({ ...values, [s.player_id]: '0' }); setNeg({ ...neg, [s.player_id]: false }); }}>Bust</button>
            )}
            {game.config.allowNegative && (
              <button style="min-width:48px" onClick={() => setNeg({ ...neg, [s.player_id]: !neg[s.player_id] })}>
                {neg[s.player_id] ? '−' : '+'}
              </button>
            )}
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              style="width:96px;text-align:right"
              value={values[s.player_id]}
              onInput={(e) => setValues({ ...values, [s.player_id]: e.currentTarget.value })}
            />
          </div>
        ))}
        <p class="muted" style="margin:0">Sum: {sum}</p>
        {sumWarning && <p class="warn" style="margin:0">{sumWarning} Du kan gemme alligevel.</p>}
        <div class="grid2">
          <button onClick={onClose}>Annullér</button>
          <button class="primary" disabled={!complete} onClick={save}>Gem</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/ui/RoundsBoard.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { undoLastRound, type SessionBundle } from '../db/actions';
import { isGameOver } from '../games/results';
import { FinishPrompt } from './FinishPrompt';
import { RoundEntry } from './RoundEntry';

export function RoundsBoard({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, entries } = bundle;
  const [editing, setEditing] = useState<number | null>(null);
  const rounds = [...new Set(entries.map((e) => e.round_no).filter((r): r is number => r !== null))].sort((a, b) => a - b);
  const totals = new Map(seats.map((s) => [s.player_id, 0]));
  for (const e of entries) if (e.player_id) totals.set(e.player_id, (totals.get(e.player_id) ?? 0) + e.points);
  const values = [...totals.values()];
  const leader = game.config.scoring === 'high' ? Math.max(...values) : Math.min(...values);
  const fixed = game.config.rounds;
  const nextRound = (rounds.at(-1) ?? 0) + 1;
  const over = isGameOver(game, session.options, seats, entries);
  const canAdd = session.status === 'in_progress' && !over && (!fixed || nextRound <= fixed.length);
  const canEdit = session.status !== 'abandoned';
  const cell = (pid: string, r: number) => entries.find((e) => e.player_id === pid && e.round_no === r)?.points ?? '';

  return (
    <>
      <div class="scroll-x">
        <table class="score">
          <thead>
            <tr>
              <th>Runde</th>
              {seats.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr class="total">
              <td>I alt</td>
              {seats.map((s) => (
                <td key={s.id} class={rounds.length && totals.get(s.player_id) === leader ? 'win' : ''}>{totals.get(s.player_id)}</td>
              ))}
            </tr>
            {rounds.map((r) => (
              <tr key={r} class={canEdit ? 'tap' : ''} onClick={() => canEdit && setEditing(r)}>
                <td>{fixed?.[r - 1]?.label ?? r}</td>
                {seats.map((s) => <td key={s.id}>{cell(s.player_id, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {game.config.target && <p class="muted">Først til {game.config.target}. Tryk på en runde for at rette den.</p>}
      {fixed && canAdd && <p class="muted">Næste: {fixed[nextRound - 1].label}: {fixed[nextRound - 1].rule}</p>}
      <div class="stack" style="margin-top:12px">
        {canAdd && <button class="primary big" onClick={() => setEditing(nextRound)}>Ny runde</button>}
        {session.status === 'in_progress' && rounds.length > 0 && (
          <button onClick={() => { if (confirm('Fjern sidste runde?')) undoLastRound(session.id); }}>Fortryd sidste runde</button>
        )}
        <FinishPrompt bundle={bundle} />
      </div>
      {editing !== null && <RoundEntry bundle={bundle} roundNo={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
```

- [ ] **Step 4: Write `src/ui/screens/Play.tsx`**

```tsx
import { loadSessionBundle } from '../../db/actions';
import { ResultBanner } from '../ResultBanner';
import { RoundsBoard } from '../RoundsBoard';
import { SessionMenu } from '../SessionMenu';
import { useLive } from '../useLive';

export function Play({ id }: { id: string }) {
  const bundle = useLive(() => loadSessionBundle(id), [id]);
  if (bundle === undefined) return null;
  if (bundle === null) return <p>Spillet findes ikke.</p>;
  const { session, game } = bundle;
  return (
    <>
      <h2 style="margin-top:0">{game.name}</h2>
      {session.note && <p class="muted">{session.note}</p>}
      <SessionMenu bundle={bundle} />
      {session.status === 'finished' && <ResultBanner bundle={bundle} />}
      {session.status === 'abandoned' && <p class="warn">Spillet er afbrudt og tæller ikke med i statistikken.</p>}
      {game.type === 'scoresheet' ? (
        <p class="muted">Yatzy-ark kommer i næste trin.</p>
      ) : game.type === 'result_only' ? (
        <p class="muted">Resultatindtastning kommer i næste trin.</p>
      ) : (
        <RoundsBoard bundle={bundle} />
      )}
    </>
  );
}
```

- [ ] **Step 5: Wire the route in `src/ui/App.tsx`**

```tsx
import { Play } from './screens/Play';
```
```tsx
    case 'play':
      return <Play id={route.id} />;
```

- [ ] **Step 6: Verify**

Run: `npm run build` → no errors. In the dev preview (mobile preset):
- 500 with two players: enter rounds; "±" makes a negative score; total row and leader highlight update; tapping a round reopens it with the values; "Fortryd sidste runde" removes it; when someone passes 500 "Ny runde" disappears and "Afslut og gem" appears; after finishing, the result list shows the winner in green.
- Flip 7 with three players: "Bust" sets 0.
- Davoserjas with three players: round 1 sum 16 shows "Summen er 16, forventet 17." and still saves; round 2 with sum 12 shows no warning; round 6 "Alle regler" accepts 64 without a warning and warns on 66; after round 7 (Kabalen) the game is over and lowest total wins.
- "Afbryd" shows the abandoned notice; "Slet" returns to Home and the game is gone from the list.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat: rounds board with entry sheet, Davoserjas sum check and finish flow"
```

---

### Task 12: Yatzy sheet

**Files:**
- Create: `src/ui/YatzySheet.tsx`
- Modify: `src/ui/screens/Play.tsx`

**Interfaces:**
- Consumes: `setSheetValue`, `undoLastSheetEntry`, `SessionBundle` (Task 5); `yatzyCategories`, `validValues`, `yatzyTotals`, `YatzyCategory` (Task 3); `diceOf` (Task 4); `FinishPrompt` (Task 11).
- Produces: `<YatzySheet bundle />`.

- [ ] **Step 1: Write `src/ui/YatzySheet.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { setSheetValue, undoLastSheetEntry, type SessionBundle } from '../db/actions';
import { diceOf } from '../games/results';
import { validValues, yatzyCategories, yatzyTotals, YATZY_BONUS, type YatzyCategory } from '../games/yatzy';
import { FinishPrompt } from './FinishPrompt';

export function YatzySheet({ bundle }: { bundle: SessionBundle }) {
  const { session, seats, entries } = bundle;
  const dice = diceOf(session.options);
  const cats = yatzyCategories(dice);
  const [pick, setPick] = useState<{ playerId: string; name: string; cat: YatzyCategory } | null>(null);
  const editable = session.status !== 'abandoned';

  const filled = new Map(
    seats.map((s) => [
      s.player_id,
      Object.fromEntries(entries.filter((e) => e.player_id === s.player_id && e.category).map((e) => [e.category!, e.points])) as Record<string, number>,
    ]),
  );
  const totals = new Map(seats.map((s) => [s.player_id, yatzyTotals(dice, filled.get(s.player_id)!)]));

  const row = (cat: YatzyCategory) => (
    <tr key={cat.key}>
      <td>{cat.label}</td>
      {seats.map((s) => {
        const v = filled.get(s.player_id)![cat.key];
        return (
          <td key={s.id} class={editable ? 'tap' : ''} onClick={() => editable && setPick({ playerId: s.player_id, name: s.name, cat })}>
            {v === undefined ? '' : v === 0 ? '–' : v}
          </td>
        );
      })}
    </tr>
  );

  return (
    <>
      <div class="scroll-x">
        <table class="score">
          <thead>
            <tr>
              <th>{dice} terninger</th>
              {seats.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {cats.filter((c) => c.section === 'upper').map(row)}
            <tr>
              <td class="muted">Sum (bonus ved {YATZY_BONUS[dice].threshold})</td>
              {seats.map((s) => <td key={s.id} class="muted">{totals.get(s.player_id)!.upper}</td>)}
            </tr>
            <tr>
              <td class="muted">Bonus</td>
              {seats.map((s) => <td key={s.id} class="muted">{totals.get(s.player_id)!.bonus}</td>)}
            </tr>
            {cats.filter((c) => c.section === 'lower').map(row)}
            <tr class="total">
              <td>I alt</td>
              {seats.map((s) => <td key={s.id}>{totals.get(s.player_id)!.total}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div class="stack" style="margin-top:12px">
        {session.status === 'in_progress' && entries.length > 0 && (
          <button onClick={() => undoLastSheetEntry(session.id)}>Fortryd sidste</button>
        )}
        <FinishPrompt bundle={bundle} />
      </div>
      {pick && (
        <div class="overlay" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div class="sheet stack">
            <h2 style="margin-top:0">{pick.name}: {pick.cat.label}</h2>
            <div class="grid4">
              {validValues(dice, pick.cat.key).map((v) => (
                <button
                  key={v}
                  class={filled.get(pick.playerId)![pick.cat.key] === v ? 'primary' : ''}
                  onClick={async () => {
                    await setSheetValue(session.id, pick.playerId, pick.cat.key, v);
                    setPick(null);
                  }}
                >
                  {v === 0 ? '– (0)' : v}
                </button>
              ))}
            </div>
            {filled.get(pick.playerId)![pick.cat.key] !== undefined && (
              <button
                onClick={async () => {
                  await setSheetValue(session.id, pick.playerId, pick.cat.key, null);
                  setPick(null);
                }}
              >
                Ryd felt
              </button>
            )}
            <button onClick={() => setPick(null)}>Annullér</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Use it in `src/ui/screens/Play.tsx`**

Add `import { YatzySheet } from '../YatzySheet';` and replace the line `<p class="muted">Yatzy-ark kommer i næste trin.</p>` with `<YatzySheet bundle={bundle} />`.

- [ ] **Step 3: Verify**

Run: `npm run build` → no errors. In the dev preview: start Yatzy with 5 dice and one player; tapping "4'ere" offers exactly 0, 4, 8, 12, 16, 20; filling 1'ere–6'ere with three of each gives Sum 63 and Bonus 50; "Ryd felt" empties a cell; "Fortryd sidste" clears the most recent cell; filling all 15 fields shows "Afslut og gem". Start Yatzy with 6 dice and check the extra fields (3 par, 5 ens, Royal straight, Villa, Tårn, Maxi Yatzy = 0 or 100) and "bonus ved 84".

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: Yatzy sheet with valid-value picker for 5 and 6 dice"
```

---

### Task 13: Result-only entry and custom games

**Files:**
- Create: `src/ui/ResultEntry.tsx`, `src/ui/CustomGames.tsx`
- Modify: `src/ui/screens/Play.tsx`, `src/ui/screens/Settings.tsx`

**Interfaces:**
- Consumes: `saveResult`, `ResultInput`, `addCustomGame`, `SessionBundle` (Task 5); `parsePoints` (Task 9); `db`, `useLive` (Tasks 5, 9).
- Produces: `<ResultEntry bundle />`, `<CustomGames />`.

- [ ] **Step 1: Write `src/ui/ResultEntry.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { saveResult, type SessionBundle } from '../db/actions';
import { parsePoints } from './points';

export function ResultEntry({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, teams, entries } = bundle;
  const participants = teams.length
    ? teams.map((t) => ({ id: t.id, isTeam: true, label: `${t.name}: ${seats.filter((s) => s.team_id === t.id).map((s) => s.name).join(', ')}` }))
    : seats.map((s) => ({ id: s.player_id, isTeam: false, label: s.name }));
  const storedPlacement = (id: string) => seats.find((s) => (s.team_id ?? s.player_id) === id)?.placement ?? 0;
  const storedPoints = (id: string, isTeam: boolean) =>
    entries.find((e) => e.category === 'result' && (isTeam ? e.team_id : e.player_id) === id)?.points;

  const [place, setPlace] = useState<Record<string, number>>(() => Object.fromEntries(participants.map((p) => [p.id, storedPlacement(p.id)])));
  const [pts, setPts] = useState<Record<string, string>>(() =>
    Object.fromEntries(participants.map((p) => { const v = storedPoints(p.id, p.isTeam); return [p.id, v === undefined ? '' : String(v)]; })),
  );
  const allPlaced = participants.every((p) => place[p.id] >= 1);
  const editable = session.status !== 'abandoned';

  async function save() {
    await saveResult(
      session.id,
      participants.map((p) => ({
        participantId: p.id,
        isTeam: p.isTeam,
        placement: place[p.id],
        points: game.config.trackScore ? parsePoints(pts[p.id] ?? '', false) : null,
      })),
    );
  }

  return (
    <div class="stack">
      {participants.map((p) => (
        <div key={p.id} class="card stack">
          <strong>{p.label}</strong>
          <div class="row">
            <button
              class={place[p.id] === 1 ? 'primary' : ''}
              disabled={!editable}
              onClick={() => setPlace(Object.fromEntries(participants.map((q) => [q.id, q.id === p.id ? 1 : 2])))}
            >
              Vinder
            </button>
            <select
              disabled={!editable}
              value={String(place[p.id] ?? 0)}
              onChange={(e) => setPlace({ ...place, [p.id]: Number(e.currentTarget.value) })}
            >
              <option value="0">Placering…</option>
              {participants.map((_, i) => <option key={i} value={String(i + 1)}>{i + 1}. plads</option>)}
            </select>
          </div>
          {game.config.trackScore && (
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Point (valgfrit)"
              disabled={!editable}
              value={pts[p.id]}
              onInput={(e) => setPts({ ...pts, [p.id]: e.currentTarget.value })}
            />
          )}
        </div>
      ))}
      {editable && (
        <button class="primary big" disabled={!allPlaced} onClick={save}>
          {session.status === 'finished' ? 'Gem ændringer' : 'Gem resultat'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/ui/CustomGames.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { addCustomGame } from '../db/actions';
import { nowIso, save } from '../db/repo';
import { db } from '../db/schema';
import type { Scoring, TeamMode } from '../games/types';
import { useLive } from './useLive';

export function CustomGames() {
  const games = useLive(async () => (await db.games.toArray()).filter((g) => !g.built_in && !g.deleted_at), []);
  const [name, setName] = useState('');
  const [teams, setTeams] = useState<TeamMode>('optional');
  const [trackScore, setTrackScore] = useState(false);
  const [scoring, setScoring] = useState<Scoring>('high');
  if (!games) return null;
  return (
    <div class="card stack">
      {games.map((g) => (
        <div key={g.id} class="row" style="justify-content:space-between">
          <span>{g.name}</span>
          <button onClick={() => { if (confirm(`Fjern ${g.name}? Gamle spil bevares.`)) save('games', { ...g, deleted_at: nowIso() }); }}>Fjern</button>
        </div>
      ))}
      <input placeholder="Navn på spil" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <select value={teams} onChange={(e) => setTeams(e.currentTarget.value as TeamMode)}>
        <option value="none">Ingen hold</option>
        <option value="optional">Hold er valgfrit</option>
        <option value="required">Altid hold</option>
      </select>
      <select value={scoring} onChange={(e) => setScoring(e.currentTarget.value as Scoring)}>
        <option value="high">Flest point vinder</option>
        <option value="low">Færrest point vinder</option>
      </select>
      <label class="row">
        <input type="checkbox" checked={trackScore} onChange={(e) => setTrackScore(e.currentTarget.checked)} /> Indtast point
      </label>
      <button
        class="primary"
        disabled={!name.trim()}
        onClick={async () => {
          await addCustomGame(name, { teams, trackScore, scoring });
          setName('');
        }}
      >
        Opret spil
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire them in**

`src/ui/screens/Play.tsx`: add `import { ResultEntry } from '../ResultEntry';` and replace `<p class="muted">Resultatindtastning kommer i næste trin.</p>` with `<ResultEntry bundle={bundle} />`.

`src/ui/screens/Settings.tsx`: add `import { CustomGames } from '../CustomGames';` and insert before `<h2>Eksport</h2>`:
```tsx
      <h2>Egne spil</h2>
      <CustomGames />
```

- [ ] **Step 4: Verify**

Run: `npm run build` → no errors. In the dev preview:
- Hitster without teams, three players: "Vinder" on one sets others to 2nd; "Gem resultat" finishes and shows the result banner; changing a placement and "Gem ændringer" updates it.
- Hitster with two teams: points per team are stored; both members of the winning team show as winners.
- Settings → Egne spil: create "Codenames" (altid hold); it appears in "Nyt spil" and requires teams; "Fjern" hides it from the list.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat: result-only entry with placements and points, plus custom games"
```

---

### Task 14: History and statistics screens

**Files:**
- Create: `src/ui/screens/History.tsx`, `src/ui/screens/Stats.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `loadSessionSummaries`, `loadResultRows` (Task 5); `gameDef` (Task 5); `summarize`, `longestWinStreak`, `headToHead`, `scoreSummary`, `favoriteGame`, `maxRoundScore` (Task 8); `SessionList`, `useLive` (Task 9).
- Produces: routes `history` and `stats`. After this task `Screen` in `App.tsx` has a case for every route, so the `default` placeholder is removed.

- [ ] **Step 1: Write `src/ui/screens/History.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { loadSessionSummaries } from '../../db/queries';
import { db } from '../../db/schema';
import { SessionList } from '../SessionList';
import { useLive } from '../useLive';

export function History() {
  const data = useLive(
    async () => ({
      list: await loadSessionSummaries(),
      games: (await db.games.toArray()).filter((g) => !g.deleted_at),
      players: (await db.players.toArray()).filter((p) => !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    }),
    [],
  );
  const [gameId, setGameId] = useState('');
  const [playerId, setPlayerId] = useState('');
  if (!data) return null;
  const items = data.list.filter(
    (s) => (!gameId || s.session.game_id === gameId) && (!playerId || s.playerIds.includes(playerId)),
  );
  return (
    <>
      <div class="grid2" style="margin-bottom:12px">
        <select value={gameId} onChange={(e) => setGameId(e.currentTarget.value)}>
          <option value="">Alle spil</option>
          {data.games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={playerId} onChange={(e) => setPlayerId(e.currentTarget.value)}>
          <option value="">Alle spillere</option>
          {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <SessionList items={items} />
    </>
  );
}
```

- [ ] **Step 2: Write `src/ui/screens/Stats.tsx`**

```tsx
import { useState } from 'preact/hooks';
import { gameDef } from '../../db/actions';
import { loadResultRows } from '../../db/queries';
import { db } from '../../db/schema';
import {
  favoriteGame, headToHead, longestWinStreak, maxRoundScore, scoreSummary, summarize, type ResultRow,
} from '../../stats/stats';
import { useLive } from '../useLive';

export function Stats() {
  const data = useLive(
    async () => ({
      rows: await loadResultRows(),
      games: (await db.games.toArray()).filter((g) => !g.deleted_at),
      players: await db.players.toArray(),
      entries: (await db.score_entries.toArray()).filter((e) => !e.deleted_at && e.round_no !== null),
    }),
    [],
  );
  const [gameId, setGameId] = useState('');
  const [playerId, setPlayerId] = useState('');
  if (!data) return null;

  const playerName = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?';
  const gameName = (id: string) => data.games.find((g) => g.id === id)?.name ?? '?';
  const rows = gameId ? data.rows.filter((r) => r.gameId === gameId) : data.rows;
  const gameRow = data.games.find((g) => g.id === gameId);
  const def = gameRow ? gameDef(gameRow) : null;
  const scores = def ? scoreSummary(rows, def.config.scoring) : null;
  const sessionIds = new Set(rows.map((r) => r.sessionId));
  const bestRound = def && (def.type === 'open_rounds' || def.type === 'fixed_rounds') && def.config.scoring === 'high'
    ? maxRoundScore(data.entries.filter((e) => sessionIds.has(e.session_id)))
    : null;
  const inRows = [...new Set(rows.map((r) => r.playerId))];

  return (
    <>
      <select value={gameId} onChange={(e) => setGameId(e.currentTarget.value)}>
        <option value="">Alle spil</option>
        {data.games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      <h2>Sejre</h2>
      {rows.length === 0 ? (
        <p class="muted">Ingen afsluttede spil endnu.</p>
      ) : (
        <table class="score">
          <thead>
            <tr><th>Spiller</th><th>Spil</th><th>Sejre</th><th>Sejr %</th></tr>
          </thead>
          <tbody>
            {summarize(rows).map((s) => (
              <tr key={s.playerId}>
                <td>{playerName(s.playerId)}</td>
                <td>{s.played}</td>
                <td>{s.wins}</td>
                <td>{Math.round(s.winRate * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {scores && scores.avg !== null && (
        <>
          <h2>Point</h2>
          <div class="card stack">
            <div>Gennemsnit: <strong>{scores.avg.toFixed(1)}</strong></div>
            <div>Bedste: <strong>{scores.best}</strong> · Værste: <strong>{scores.worst}</strong></div>
            {bestRound && <div>Flest point i én runde: <strong>{bestRound.points}</strong> ({playerName(bestRound.playerId)})</div>}
          </div>
        </>
      )}

      <h2>Spiller</h2>
      <select value={playerId} onChange={(e) => setPlayerId(e.currentTarget.value)}>
        <option value="">Vælg spiller…</option>
        {inRows.map((id) => <option key={id} value={id}>{playerName(id)}</option>)}
      </select>
      {playerId && (
        <PlayerStats rows={rows} allRows={data.rows} playerId={playerId} playerName={playerName} gameName={gameName} />
      )}
    </>
  );
}

function PlayerStats(props: {
  rows: ResultRow[];
  allRows: ResultRow[];
  playerId: string;
  playerName: (id: string) => string;
  gameName: (id: string) => string;
}) {
  const { rows, allRows, playerId, playerName, gameName } = props;
  const me = summarize(rows).find((s) => s.playerId === playerId);
  const fav = favoriteGame(allRows, playerId);
  const others = [...new Set(rows.map((r) => r.playerId))].filter((id) => id !== playerId);
  return (
    <div class="card stack" style="margin-top:8px">
      <div>Spil: <strong>{me?.played ?? 0}</strong> · Sejre: <strong>{me?.wins ?? 0}</strong></div>
      <div>Længste sejrsstime: <strong>{longestWinStreak(rows, playerId)}</strong></div>
      {fav && <div>Favoritspil: <strong>{gameName(fav)}</strong></div>}
      {others.length > 0 && (
        <table class="score">
          <thead>
            <tr><th>Mod</th><th>Spil</th><th>Vundet</th><th>Tabt</th></tr>
          </thead>
          <tbody>
            {others.map((o) => {
              const h = headToHead(rows, playerId, o);
              return h.games ? (
                <tr key={o}><td>{playerName(o)}</td><td>{h.games}</td><td>{h.aWins}</td><td>{h.bWins}</td></tr>
              ) : null;
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the routes in `src/ui/App.tsx`**

Add imports:
```tsx
import { History } from './screens/History';
import { Stats } from './screens/Stats';
```
Replace the `Screen` function with:
```tsx
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'new':
      return <NewGame />;
    case 'play':
      return <Play id={route.id} />;
    case 'history':
      return <History />;
    case 'stats':
      return <Stats />;
    case 'settings':
      return <Settings />;
  }
}
```

- [ ] **Step 4: Verify**

Run: `npm test` → all PASS. Run: `npm run build` → no errors. In the dev preview, with a few finished games of different types: Historik filters by game and by player; tapping an entry opens it. Statistik shows win counts and percentages; choosing 500 shows average/best/worst and "Flest point i én runde"; choosing Davoserjas shows best = lowest; choosing a player shows streak, favourite game and the head-to-head table.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat: history with filters and statistics screens"
```

---

### Task 15: PWA, wake lock, deploy and keep-alive

**Files:**
- Create: `public/icon.svg`, `src/ui/useWakeLock.ts`, `.github/workflows/deploy.yml`, `.github/workflows/keepalive.yml`
- Modify: `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/screens/Play.tsx`
- Generated: `public/favicon.ico`, `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`

**Interfaces:**
- Consumes: `loadSessionBundle` (Task 5).
- Produces: `useWakeLock(active: boolean): void`; installable PWA; deploy on push to `main`.

- [ ] **Step 1: Create `public/icon.svg` and generate icons**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2f6fed"/>
  <rect x="136" y="136" width="240" height="240" rx="40" fill="#ffffff"/>
  <circle cx="196" cy="196" r="24" fill="#2f6fed"/>
  <circle cx="256" cy="256" r="24" fill="#2f6fed"/>
  <circle cx="316" cy="316" r="24" fill="#2f6fed"/>
</svg>
```

Run: `npm run icons`
Expected: the six generated files listed above appear in `public/`.

- [ ] **Step 2: Update `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/Spilscore/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Spilscore',
        short_name: 'Spilscore',
        lang: 'da',
        theme_color: '#14161a',
        background_color: '#14161a',
        display: 'standalone',
        start_url: '/Spilscore/',
        scope: '/Spilscore/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', passWithNoTests: true },
});
```

- [ ] **Step 3: Update `tsconfig.json` and `index.html`**

In `tsconfig.json` change `"types": ["vite/client"]` to `"types": ["vite/client", "vite-plugin-pwa/client"]`.

In `index.html` add inside `<head>` (after the title):
```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

- [ ] **Step 4: Write `src/ui/useWakeLock.ts` and use it in Play**

`src/ui/useWakeLock.ts`:
```ts
import { useEffect } from 'preact/hooks';

/** Keeps the screen on while active. Silently does nothing where unsupported. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, [active]);
}
```

In `src/ui/screens/Play.tsx` add `import { useWakeLock } from '../useWakeLock';` and, directly after the `useLive` line (before any `return`):
```tsx
  useWakeLock(bundle?.session.status === 'in_progress');
```

- [ ] **Step 5: Register the service worker in `src/main.tsx`**

Add at the top:
```tsx
import { registerSW } from 'virtual:pwa-register';
```
Add at the end of the file:
```tsx
// A new version waits until no game screen is open, so an update never interrupts a game.
const updateSW = registerSW({
  onNeedRefresh() {
    if (!location.hash.startsWith('#/play/')) updateSW(true);
  },
});
```

- [ ] **Step 6: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 7: Write `.github/workflows/keepalive.yml`**

GitHub disables scheduled workflows after 60 days without repo activity; the keepalive-workflow step re-enables it through the API, no commits.

```yaml
name: Supabase keep-alive
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

permissions:
  actions: write
  contents: read

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Ping Supabase
        run: |
          set -a; source .env; set +a
          curl -fsS "$VITE_SUPABASE_URL/rest/v1/games?select=id&limit=1" -H "apikey: $VITE_SUPABASE_KEY"
      - uses: gautamkrishnar/keepalive-workflow@v2
```

- [ ] **Step 8: Verify locally**

Run: `npm test` → PASS. Run: `npm run build` → `dist/` contains `manifest.webmanifest` and `sw.js`.
Run: `npm run preview` and open `http://localhost:4173/Spilscore/` in the Browser pane: no console errors; the manifest is linked; Home renders.

- [ ] **Step 9: Commit and push**

```bash
git add -A
git commit -m "feat: PWA manifest, icons, wake lock, Pages deploy and Supabase keep-alive"
git push -u origin main
```

If the agent's terminal cannot authenticate to GitHub, Frederik runs `git push -u origin main` from his own terminal.

- [ ] **Step 10: Enable Pages (Frederik)**

GitHub → Spilscore → Settings → Pages → Source: **GitHub Actions**. Then Actions → Deploy → "Re-run all jobs". Expected: green run; `https://flamse09.github.io/Spilscore/` loads.

---

### Task 16: End-to-end check on the iPhone

**Files:** none (manual verification; fix-ups go in their own commits).

- [ ] **Step 1:** On the iPhone, open `https://flamse09.github.io/Spilscore/` in Safari → Share → "Føj til hjemmeskærm". Open it from the home screen; there is no Safari address bar.
- [ ] **Step 2:** Settings → log in with the email code. The badge shows "✓ Synkroniseret".
- [ ] **Step 3:** Play a short game of each type (500, Flip 7, Davoserjas, Yatzy 5 and 6 dice, Hitster with teams) and finish them. Check that the rows appear in Supabase Table Editor and in `select * from v_results`.
- [ ] **Step 4:** Airplane mode mid-game: enter two rounds (badge shows "Offline · N venter"), switch airplane mode off and reopen the app; the badge returns to "✓ Synkroniseret" and the rounds are in Supabase.
- [ ] **Step 5:** Restore test: in desktop Safari/Chrome open the site in a private window, log in with the same email; after sync, Historik shows the same games.
- [ ] **Step 6:** The screen stays on during a game (on iOS versions that support Wake Lock in home-screen apps).
- [ ] **Step 7:** Optional: in Supabase → Authentication → Sign In / Providers, disable "Allow new users to sign up".
- [ ] **Step 8:** Commit any fixes found:

```bash
git add -A
git commit -m "fix: issues found in on-device testing"
git push
```
