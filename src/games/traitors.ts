// Forræder: roles and outcomes are entered after the game, when the roles are revealed.

export type TraitorRole = 'loyal' | 'traitor';
export type TraitorOutcome = 'overlevede' | 'myrdet' | 'forvist';

export const ROLE_LABEL: Record<TraitorRole, string> = { loyal: 'Trofast', traitor: 'Forræder' };
/** Session team names; Power BI and statistics see the role as the team. */
export const TEAM_NAME: Record<TraitorRole, string> = { loyal: 'Trofaste', traitor: 'Forrædere' };
export const OUTCOME_LABEL: Record<TraitorOutcome, string> = { overlevede: 'Overlevede', myrdet: 'Myrdet', forvist: 'Forvist' };

/** Traitors win if at least one traitor survived; otherwise the loyal win. */
export function traitorWinner(rows: { role: TraitorRole; outcome: TraitorOutcome }[]): TraitorRole {
  return rows.some((r) => r.role === 'traitor' && r.outcome === 'overlevede') ? 'traitor' : 'loyal';
}

export function traitorCountWarning(rows: { role: TraitorRole }[], expected: number): string | null {
  const n = rows.filter((r) => r.role === 'traitor').length;
  if (n === expected) return null;
  return `Du har markeret ${n} ${n === 1 ? 'forræder' : 'forrædere'}, men valgte ${expected} ved start.`;
}
