import { useState } from 'preact/hooks';
import { gameDef } from '../../db/actions';
import { loadRecordInput, loadResultRows } from '../../db/queries';
import { db } from '../../db/schema';
import {
  favoriteGame, headToHead, longestWinStreak, maxRoundScore, scoreSummary, summarize, type ResultRow,
} from '../../stats/stats';
import { computeRecords, type GameRecord } from '../../stats/records';
import { RecordList } from '../RecordList';
import { useLive } from '../useLive';

export function Stats() {
  const data = useLive(async () => {
    const rows = await loadResultRows();
    const games = await db.games.toArray();
    const records: { gameId: string; name: string; list: GameRecord[] }[] = [];
    for (const g of games) {
      if (!rows.some((r) => r.gameId === g.id)) continue;
      const list = computeRecords(gameDef(g), await loadRecordInput(g.id));
      if (list.length) records.push({ gameId: g.id, name: g.name, list });
    }
    return {
      rows,
      games,
      records,
      players: await db.players.toArray(),
      entries: (await db.score_entries.toArray()).filter((e) => !e.deleted_at && e.round_no !== null),
    };
  }, []);
  const [gameId, setGameId] = useState('');
  const [playerId, setPlayerId] = useState('');
  if (!data) return null;

  const playerName = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?';
  const gameName = (id: string) => data.games.find((g) => g.id === id)?.name ?? '?';
  const rows = gameId ? data.rows.filter((r) => r.gameId === gameId) : data.rows;
  const gameRow = data.games.find((g) => g.id === gameId);
  const def = gameRow ? gameDef(gameRow) : null;
  const scores = def ? scoreSummary(rows, def.config.scoring) : null;
  const sessionIds = new Set(rows.map((r) => r.sessionId));
  const bestRound = def && (def.type === 'open_rounds' || def.type === 'fixed_rounds') && def.config.scoring === 'high'
    ? maxRoundScore(data.entries.filter((e) => sessionIds.has(e.session_id)))
    : null;
  const inRows = [...new Set(rows.map((r) => r.playerId))];

  return (
    <>
      <select value={gameId} onChange={(e) => setGameId(e.currentTarget.value)}>
        <option value="">Alle spil</option>
        {data.games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      <h2>Sejre</h2>
      {rows.length === 0 ? (
        <p class="muted">Ingen afsluttede spil endnu.</p>
      ) : (
        <table class="score">
          <thead>
            <tr><th>Spiller</th><th>Spil</th><th>Sejre</th><th>Sejr %</th></tr>
          </thead>
          <tbody>
            {summarize(rows).map((s) => (
              <tr key={s.playerId}>
                <td>{playerName(s.playerId)}</td>
                <td>{s.played}</td>
                <td>{s.wins}</td>
                <td>{Math.round(s.winRate * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {scores && scores.avg !== null && (
        <>
          <h2>Point</h2>
          <div class="card stack">
            <div>Gennemsnit: <strong>{scores.avg.toFixed(1)}</strong></div>
            <div>Bedste: <strong>{scores.best}</strong> · Værste: <strong>{scores.worst}</strong></div>
            {bestRound && <div>Flest point i én runde: <strong>{bestRound.points}</strong> ({playerName(bestRound.playerId)})</div>}
          </div>
        </>
      )}

      <h2>Rekorder</h2>
      {(() => {
        const shown = data.records.filter((r) => !gameId || r.gameId === gameId);
        if (!shown.length) return <p class="muted">Ingen rekorder endnu.</p>;
        return shown.map((r) => (
          <div key={r.gameId} class="card">
            {!gameId && <strong>{r.name}</strong>}
            <RecordList records={r.list} nameOf={playerName} />
          </div>
        ));
      })()}

      <h2>Spiller</h2>
      <select value={playerId} onChange={(e) => setPlayerId(e.currentTarget.value)}>
        <option value="">Vælg spiller…</option>
        {inRows.map((id) => <option key={id} value={id}>{playerName(id)}</option>)}
      </select>
      {playerId && (
        <PlayerStats rows={rows} allRows={data.rows} playerId={playerId} playerName={playerName} gameName={gameName} />
      )}
    </>
  );
}

function PlayerStats(props: {
  rows: ResultRow[];
  allRows: ResultRow[];
  playerId: string;
  playerName: (id: string) => string;
  gameName: (id: string) => string;
}) {
  const { rows, allRows, playerId, playerName, gameName } = props;
  const me = summarize(rows).find((s) => s.playerId === playerId);
  const fav = favoriteGame(allRows, playerId);
  const others = [...new Set(rows.map((r) => r.playerId))].filter((id) => id !== playerId);
  return (
    <div class="card stack" style="margin-top:8px">
      <div>Spil: <strong>{me?.played ?? 0}</strong> · Sejre: <strong>{me?.wins ?? 0}</strong></div>
      <div>Længste sejrsstime: <strong>{longestWinStreak(rows, playerId)}</strong></div>
      {fav && <div>Favoritspil: <strong>{gameName(fav)}</strong></div>}
      {others.length > 0 && (
        <table class="score">
          <thead>
            <tr><th>Mod</th><th>Spil</th><th>Vundet</th><th>Tabt</th></tr>
          </thead>
          <tbody>
            {others.map((o) => {
              const h = headToHead(rows, playerId, o);
              return h.games ? (
                <tr key={o}><td>{playerName(o)}</td><td>{h.games}</td><td>{h.aWins}</td><td>{h.bWins}</td></tr>
              ) : null;
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
