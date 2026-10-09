import { finishSession, type SessionBundle } from '../db/actions';
import { isGameOver } from '../games/results';

export function FinishPrompt({ bundle }: { bundle: SessionBundle }) {
  const { session, game, seats, entries } = bundle;
  if (session.status !== 'in_progress' || !isGameOver(game, session.options, seats, entries)) return null;
  return (
    <div class="card stack">
      <strong>Spillet er slut</strong>
      <button class="primary big" onClick={() => finishSession(session.id)}>Afslut og gem</button>
    </div>
  );
}
