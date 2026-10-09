import { useState } from 'preact/hooks';
import { addPlayer, gameDef, startSession } from '../../db/actions';
import { byRecent, loadPlayerActivity } from '../../db/queries';
import { db } from '../../db/schema';
import { startProblem } from '../../games/validate';
import { navigate } from '../router';
import { useLive } from '../useLive';

export function NewGame() {
  const data = useLive(
    async () => ({
      games: (await db.games.toArray()).filter((g) => !g.deleted_at).sort((a, b) => Number(b.built_in) - Number(a.built_in) || a.name.localeCompare(b.name, 'da')),
      players: byRecent((await db.players.toArray()).filter((p) => !p.deleted_at && !p.archived), await loadPlayerActivity()),
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
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  const row = data.games.find((g) => g.id === gameId);
  const game = row ? gameDef(row) : null;
  const useTeams = !!game && (game.config.teams === 'required' || (game.config.teams === 'optional' && teamsOn));
  const team = (pid: string) => (teamOf[pid] ?? seats.indexOf(pid)) % teamCount;
  const teamSizes = useTeams ? Array.from({ length: teamCount }, (_, t) => seats.filter((p) => team(p) === t).length) : null;
  const problem = game ? startProblem(game, seats.length, teamSizes) : 'Vælg et spil';
  const name = (pid: string) => data.players.find((p) => p.id === pid)?.name ?? '?';

  function toggleSeat(pid: string) {
    setSeats((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  }

  async function start() {
    if (!game || problem) return;
    setBusy(true);
    setError(null);
    let navigated = false;
    try {
      const opts: Record<string, number> = {};
      for (const o of game.config.options ?? []) opts[o.key] = options[o.key] ?? o.default;
      const teamNames = useTeams ? Array.from({ length: teamCount }, (_, i) => `Hold ${i + 1}`) : [];
      const id = await startSession(game.id, opts, seats.map((pid) => ({ playerId: pid, teamIndex: useTeams ? team(pid) : null })), teamNames);
      navigated = true;
      navigate({ name: 'play', id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!navigated) setBusy(false);
    }
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
        {error && <p class="warn">Kunne ikke starte spillet: {error}</p>}
        <button class="primary big" disabled={!!problem || busy} onClick={start}>Start</button>
      </div>
    </>
  );
}
