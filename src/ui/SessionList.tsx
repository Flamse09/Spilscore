import type { SessionSummary } from '../db/queries';
import { formatDate } from './points';
import { href } from './router';

const STATUS: Record<string, string> = { in_progress: 'I gang', finished: '', abandoned: 'Afbrudt' };

export function SessionList({ items }: { items: SessionSummary[] }) {
  if (!items.length) return <p class="muted">Ingen spil endnu.</p>;
  return (
    <>
      {items.map((s) => (
        <a key={s.session.id} class="card" href={href({ name: 'play', id: s.session.id })}>
          <div class="row" style="justify-content:space-between">
            <strong>{s.gameName}</strong>
            <span class="row" style="gap:6px">
              {STATUS[s.session.status] && <span class={`tag ${s.session.status}`}>{STATUS[s.session.status]}</span>}
              <span class="muted small">{formatDate(s.session.started_at)}</span>
            </span>
          </div>
          <div class="muted">{s.players.join(', ')}</div>
          {s.winners.length > 0 && <div class="win">🏆 {s.winners.join(' og ')}</div>}
        </a>
      ))}
    </>
  );
}
