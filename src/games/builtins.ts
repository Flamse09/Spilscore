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
