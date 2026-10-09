import { useState } from 'preact/hooks';
import { finishSession, type SessionBundle } from '../db/actions';
import { isGameOver } from '../games/results';

export function FinishPrompt({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, entries } = bundle;
  const [error, setError] = useState<string | null>(null);
  if (session.status !== 'in_progress' || !isGameOver(game, session.options, seats, entries)) return null;

  async function finish() {
    setError(null);
    try {
      await finishSession(session.id);
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div class="card stack">
      <strong>Spillet er slut</strong>
      <button class="primary big" onClick={finish}>Afslut og gem</button>
      {error && <p class="warn" style="margin:0">{error}</p>}
    </div>
  );
}
