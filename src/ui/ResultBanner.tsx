import { useState } from 'preact/hooks';
import { rematch, type SessionBundle } from '../db/actions';
import { loadRecordInput } from '../db/queries';
import { computeRecords } from '../stats/records';
import { navigate } from './router';
import { useLive } from './useLive';

export function ResultBanner({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats } = bundle;
  const ranked = [...seats].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));
  const [error, setError] = useState<string | null>(null);

  // Records this game set. Only celebrated when there are earlier games to beat.
  const newRecords = useLive(async () => {
    const input = await loadRecordInput(game.id);
    if (new Set(input.results.map((r) => r.sessionId)).size < 2) return [];
    return computeRecords(game, input).filter((r) => r.sessionId === session.id);
  }, [game.id, session.id, session.updated_at]);
  const nameOf = (id: string) => seats.find((s) => s.player_id === id)?.name ?? '?';

  async function playAgain() {
    setError(null);
    try {
      navigate({ name: 'play', id: await rematch(session.id) });
    } catch (e) {
      setError(`Kunne ikke starte: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div class="card stack">
      {ranked.map((s) => (
        <div key={s.id} class={`row ${s.is_winner ? 'win' : ''}`} style="justify-content:space-between">
          <span>{s.placement}. {s.name}</span>
          <span>{s.final_score ?? ''}</span>
        </div>
      ))}
      {newRecords?.map((r) => (
        <p key={r.key} class="record" style="margin:0">🏆 Ny rekord: {r.title.toLowerCase()} {r.value} ({r.holders.map(nameOf).join(', ')})</p>
      ))}
      <button class="primary big" onClick={playAgain}>Spil igen</button>
      {error && <p class="warn" style="margin:0">{error}</p>}
    </div>
  );
}
