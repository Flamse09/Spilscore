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
              if (v && v !== p.name) run(() => updatePlayer(p, { name: v }));
            }}
          />
          <button onClick={() => run(() => updatePlayer(p, { archived: !p.archived }))}>{p.archived ? 'Gendan' : 'Arkivér'}</button>
        </div>
      ))}
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
      {error && <p class="warn" style="margin:0">{error}</p>}
    </div>
  );
}
