import { abandonSession, deleteSession, finishSession, setNote, type SessionBundle } from '../db/actions';
import { navigate } from './router';

export function SessionMenu({ bundle }: { bundle: SessionBundle }) {
  const { session, game } = bundle;
  const inProgress = session.status === 'in_progress';
  return (
    <div class="row" style="flex-wrap:wrap;margin:8px 0 12px">
      <button onClick={() => { const n = prompt('Note til spillet', session.note ?? ''); if (n !== null) setNote(session.id, n); }}>
        Note
      </button>
      {inProgress && game.type !== 'result_only' && (
        <button onClick={() => { if (confirm('Afslut spillet nu med den nuværende stilling?')) finishSession(session.id); }}>Afslut nu</button>
      )}
      {inProgress && (
        <button onClick={() => { if (confirm('Afbryd spillet? Det tæller ikke med i statistikken.')) abandonSession(session.id); }}>Afbryd</button>
      )}
      <button
        onClick={async () => {
          if (!confirm('Slet spillet?')) return;
          await deleteSession(session.id);
          navigate({ name: 'home' });
        }}
      >
        Slet
      </button>
    </div>
  );
}
