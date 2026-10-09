import { useState } from 'preact/hooks';
import { undoLastRound, type SessionBundle } from '../db/actions';
import { isGameOver, roundsFor } from '../games/results';
import { FinishPrompt } from './FinishPrompt';
import { RoundEntry } from './RoundEntry';

export function RoundsBoard({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, entries } = bundle;
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setError(null);
    try {
      await undoLastRound(session.id);
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const rounds = [...new Set(entries.map((e) => e.round_no).filter((r): r is number => r !== null))].sort((a, b) => a - b);
  const totals = new Map(seats.map((s) => [s.player_id, 0]));
  for (const e of entries) if (e.player_id) totals.set(e.player_id, (totals.get(e.player_id) ?? 0) + e.points);
  const values = [...totals.values()];
  const leader = game.config.scoring === 'high' ? Math.max(...values) : Math.min(...values);
  const fixed = roundsFor(game, session.options);
  const target = game.config.target;
  const nextRound = (rounds.at(-1) ?? 0) + 1;
  const over = isGameOver(game, session.options, seats, entries);
  const canAdd = session.status === 'in_progress' && !over && (!fixed || nextRound <= fixed.length);
  const canEdit = session.status !== 'abandoned';
  const cell = (pid: string, r: number) => entries.find((e) => e.player_id === pid && e.round_no === r)?.points ?? '';

  return (
    <>
      <div class="board">
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
            {target !== undefined && rounds.length > 0 && (
              <tr class="sub">
                <td class="muted">Mangler</td>
                {seats.map((s) => {
                  const left = target - (totals.get(s.player_id) ?? 0);
                  return <td key={s.id} class="muted">{left > 0 ? left : '✓'}</td>;
                })}
              </tr>
            )}
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
          <button onClick={() => { if (confirm('Fjern sidste runde?')) undo(); }}>Fortryd sidste runde</button>
        )}
        {error && <p class="warn" style="margin:0">{error}</p>}
        <FinishPrompt bundle={bundle} />
      </div>
      {editing !== null && <RoundEntry bundle={bundle} roundNo={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
