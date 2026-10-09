import { loadSessionBundle } from '../../db/actions';
import { ResultBanner } from '../ResultBanner';
import { RoundsBoard } from '../RoundsBoard';
import { SessionMenu } from '../SessionMenu';
import { useLive } from '../useLive';

export function Play({ id }: { id: string }) {
  const bundle = useLive(() => loadSessionBundle(id), [id]);
  if (bundle === undefined) return null;
  if (bundle === null) return <p>Spillet findes ikke.</p>;
  const { session, game } = bundle;
  return (
    <>
      <h2 style="margin-top:0">{game.name}</h2>
      {session.note && <p class="muted">{session.note}</p>}
      <SessionMenu bundle={bundle} />
      {session.status === 'finished' && <ResultBanner bundle={bundle} />}
      {session.status === 'abandoned' && <p class="warn">Spillet er afbrudt og tæller ikke med i statistikken.</p>}
      {game.type === 'scoresheet' ? (
        <p class="muted">Yatzy-ark kommer i næste trin.</p>
      ) : game.type === 'result_only' ? (
        <p class="muted">Resultatindtastning kommer i næste trin.</p>
      ) : (
        <RoundsBoard bundle={bundle} />
      )}
    </>
  );
}
