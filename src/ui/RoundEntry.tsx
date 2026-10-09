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
