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
