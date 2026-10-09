import { useState } from 'preact/hooks';
import { addPlayer, updatePlayer } from '../../db/actions';
import { byRecent, loadPlayerActivity } from '../../db/queries';
import { db, type PlayerRow } from '../../db/schema';
import { formatDate } from '../points';
import { useLive } from '../useLive';

export function Players() {
  const data = useLive(async () => {
    const players = (await db.players.toArray()).filter((p) => !p.deleted_at);
    const activity = await loadPlayerActivity();
    const sorted = byRecent(players, activity);
    return { active: sorted.filter((p) => !p.archived), inactive: sorted.filter((p) => p.archived), activity };
  }, []);
  const [name, setName] = useState('');
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

  if (!data) return null;

  const row = (p: PlayerRow) => {
    const a = data.activity.get(p.id);
    return (
      <div key={p.id} class="card stack">
        <input
          value={p.name}
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== p.name) run(() => updatePlayer(p, { name: v }));
            else e.currentTarget.value = p.name;
          }}
        />
        <div class="row" style="justify-content:space-between">
          <span class="muted">
            {a?.games ?? 0} spil · {a?.lastPlayed ? `sidst ${formatDate(a.lastPlayed)}` : 'aldrig spillet'}
          </span>
          <button onClick={() => run(() => updatePlayer(p, { archived: !p.archived }))}>
            {p.archived ? 'Gør aktiv' : 'Gør inaktiv'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div class="row">
        <input placeholder="Ny spiller" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button
          class="primary"
          disabled={!name.trim()}
          onClick={async () => {
            if (await run(() => addPlayer(name))) setName('');
          }}
        >
          Tilføj
        </button>
      </div>
      {error && <p class="warn">{error}</p>}

      <h2>Aktive</h2>
      <p class="muted" style="margin-top:0">Sorteret efter seneste spil. Inaktive spillere vises ikke under "Nyt spil", men deres historik bevares.</p>
      {data.active.length ? data.active.map(row) : <p class="muted">Ingen aktive spillere.</p>}

      {data.inactive.length > 0 && (
        <>
          <h2>Inaktive</h2>
          {data.inactive.map(row)}
        </>
      )}
    </>
  );
}
