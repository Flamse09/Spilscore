import { loadSessionSummaries } from '../../db/queries';
import { href, navigate } from '../router';
import { SessionList } from '../SessionList';
import { useLive } from '../useLive';

export function Home() {
  const list = useLive(() => loadSessionSummaries(), []);
  if (!list) return null;
  const active = list.find((s) => s.session.status === 'in_progress');
  return (
    <>
      {active && (
        <a class="card" href={href({ name: 'play', id: active.session.id })}>
          <div class="muted">Spil i gang</div>
          <strong>Fortsæt {active.gameName}</strong>
          <div class="muted">{active.players.join(', ')}</div>
        </a>
      )}
      <button class="primary big" onClick={() => navigate({ name: 'new' })}>Nyt spil</button>
      <h2>Seneste spil</h2>
      <SessionList items={list.slice(0, 10)} />
    </>
  );
}
