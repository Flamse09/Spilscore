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
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
  if (!games) return null;
  return (
    <div class="card stack">
      {games.map((g) => (
        <div key={g.id} class="row" style="justify-content:space-between">
          <span>{g.name}</span>
          <button onClick={() => { if (confirm(`Fjern ${g.name}? Gamle spil bevares.`)) run(() => save('games', { ...g, deleted_at: nowIso() })); }}>Fjern</button>
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
          if (await run(() => addCustomGame(name, { teams, trackScore, scoring }))) setName('');
        }}
      >
        Opret spil
      </button>
      {error && <p class="warn" style="margin:0">{error}</p>}
    </div>
  );
}
