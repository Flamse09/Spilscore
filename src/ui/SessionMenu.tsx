import { useState } from 'preact/hooks';
import { abandonSession, deleteSession, finishSession, reopenSession, setNote, type SessionBundle } from '../db/actions';
import { navigate } from './router';

export function SessionMenu({ bundle }: { bundle: SessionBundle }) {
  const { session, game } = bundle;
  const inProgress = session.status === 'in_progress';
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <div class="row" style="flex-wrap:wrap;margin:8px 0 12px">
        <button onClick={() => { const n = prompt('Note til spillet', session.note ?? ''); if (n !== null) run(() => setNote(session.id, n)); }}>
          Note
        </button>
        {inProgress && game.type !== 'result_only' && (
          <button onClick={() => { if (confirm('Afslut spillet nu med den nuværende stilling?')) run(() => finishSession(session.id)); }}>Afslut nu</button>
        )}
        {inProgress && (
          <button onClick={() => { if (confirm('Afbryd spillet? Det tæller ikke med i statistikken.')) run(() => abandonSession(session.id)); }}>Afbryd</button>
        )}
        {session.status !== 'in_progress' && (
          <button onClick={() => { if (confirm('Genoptag spillet? Det tæller ikke med i statistikken, før det er afsluttet igen.')) run(() => reopenSession(session.id)); }}>Genoptag</button>
        )}
        <button
          onClick={() => {
            if (!confirm('Slet spillet?')) return;
            run(async () => {
              await deleteSession(session.id);
              navigate({ name: 'home' });
            });
          }}
        >
          Slet
        </button>
      </div>
      {error && <p class="warn">{error}</p>}
    </>
  );
}
