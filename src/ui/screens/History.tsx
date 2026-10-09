import { useState } from 'preact/hooks';
import { loadSessionSummaries } from '../../db/queries';
import { db } from '../../db/schema';
import { SessionList } from '../SessionList';
import { useLive } from '../useLive';

export function History() {
  const data = useLive(
    async () => ({
      list: await loadSessionSummaries(),
      games: (await db.games.toArray()).filter((g) => !g.deleted_at),
      players: (await db.players.toArray()).filter((p) => !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    }),
    [],
  );
  const [gameId, setGameId] = useState('');
  const [playerId, setPlayerId] = useState('');
  if (!data) return null;
  const items = data.list.filter(
    (s) => (!gameId || s.session.game_id === gameId) && (!playerId || s.playerIds.includes(playerId)),
  );
  return (
    <>
      <div class="grid2" style="margin-bottom:12px">
        <select value={gameId} onChange={(e) => setGameId(e.currentTarget.value)}>
          <option value="">Alle spil</option>
          {data.games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={playerId} onChange={(e) => setPlayerId(e.currentTarget.value)}>
          <option value="">Alle spillere</option>
          {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <SessionList items={items} />
    </>
  );
}
