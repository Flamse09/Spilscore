import { useState } from 'preact/hooks';
import { saveTraitorsResult, type SessionBundle } from '../db/actions';
import {
  OUTCOME_LABEL, ROLE_LABEL, TEAM_NAME, traitorCountWarning, traitorWinner, type TraitorOutcome, type TraitorRole,
} from '../games/traitors';
import { parsePoints } from './points';

interface Row {
  role: TraitorRole;
  outcome: TraitorOutcome;
  round: string;
  silver: string;
}

const ROLES: TraitorRole[] = ['loyal', 'traitor'];
const OUTCOMES: TraitorOutcome[] = ['overlevede', 'myrdet', 'forvist'];

/** Forræder result: roles, how each player left, and silver bars, all entered after the game. */
export function TraitorsEntry({ bundle }: { bundle: SessionBundle }) {
  const { session, seats, teams, entries } = bundle;
  const expected = session.options.traitors ?? 1;
  const editable = session.status !== 'abandoned';

  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      seats.map((s) => {
        const team = teams.find((t) => t.id === s.team_id);
        const entry = entries.find((e) => e.player_id === s.player_id);
        const row: Row = {
          role: team?.name === TEAM_NAME.traitor ? 'traitor' : 'loyal',
          outcome: (entry?.category as TraitorOutcome | undefined) ?? 'overlevede',
          round: entry?.round_no != null ? String(entry.round_no) : '',
          silver: entry ? String(entry.points) : '',
        };
        return [s.player_id, row];
      }),
    ),
  );
  const winnerSeat = seats.find((s) => s.is_winner);
  const winnerTeam = winnerSeat && teams.find((t) => t.id === winnerSeat.team_id);
  const storedWinner: TraitorRole | null = winnerTeam ? (winnerTeam.name === TEAM_NAME.traitor ? 'traitor' : 'loyal') : null;
  const [override, setOverride] = useState<TraitorRole | null>(storedWinner);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (pid: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [pid]: { ...r[pid], ...patch } }));
  const list = seats.map((s) => ({ playerId: s.player_id, ...rows[s.player_id] }));
  const suggested = traitorWinner(list);
  const winner = override ?? suggested;
  const warning = traitorCountWarning(list, expected);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveTraitorsResult(
        session.id,
        list.map((r) => ({
          playerId: r.playerId,
          role: r.role,
          outcome: r.outcome,
          roundOut: r.outcome === 'overlevede' ? null : parsePoints(r.round, false),
          silver: parsePoints(r.silver, false) ?? 0,
        })),
        winner,
      );
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <p class="muted" style="margin:0">Udfyld når spillet er slut og rollerne er afsløret. {expected} {expected === 1 ? 'forræder' : 'forrædere'} valgt ved start.</p>
      {seats.map((s) => {
        const r = rows[s.player_id];
        return (
          <div key={s.player_id} class="card stack">
            <strong>{s.name}</strong>
            <div class="chips">
              {ROLES.map((role) => (
                <button key={role} class={`chip ${r.role === role ? 'on' : ''}`} disabled={!editable} onClick={() => set(s.player_id, { role })}>
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
            <div class="chips">
              {OUTCOMES.map((outcome) => (
                <button key={outcome} class={`chip ${r.outcome === outcome ? 'on' : ''}`} disabled={!editable} onClick={() => set(s.player_id, { outcome })}>
                  {OUTCOME_LABEL[outcome]}
                </button>
              ))}
            </div>
            <div class="grid2">
              {r.outcome !== 'overlevede' ? (
                <input inputMode="numeric" pattern="[0-9]*" placeholder="Røg ud i runde" disabled={!editable} value={r.round} onInput={(e) => set(s.player_id, { round: e.currentTarget.value })} />
              ) : (
                <span />
              )}
              <input inputMode="numeric" pattern="[0-9]*" placeholder="Sølvbarer" disabled={!editable} value={r.silver} onInput={(e) => set(s.player_id, { silver: e.currentTarget.value })} />
            </div>
          </div>
        );
      })}

      <div class="card stack">
        <strong>Hvem vandt?</strong>
        <div class="chips">
          {ROLES.map((role) => (
            <button key={role} class={`chip ${winner === role ? 'on' : ''}`} disabled={!editable} onClick={() => setOverride(role)}>
              {TEAM_NAME[role]}{role === suggested ? ' (foreslået)' : ''}
            </button>
          ))}
        </div>
        <p class="muted small" style="margin:0">Forslaget: forræderne vinder, hvis mindst én forræder overlevede.</p>
      </div>

      {warning && <p class="warn" style="margin:0">{warning}</p>}
      {editable && (
        <button class="primary big" disabled={busy} onClick={save}>
          {session.status === 'finished' ? 'Gem ændringer' : 'Gem resultat'}
        </button>
      )}
      {error && <p class="warn" style="margin:0">{error}</p>}
    </div>
  );
}
