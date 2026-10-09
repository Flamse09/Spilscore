import type { SessionBundle } from '../db/actions';

export function ResultBanner({ bundle }: { bundle: SessionBundle }) {
  const ranked = [...bundle.seats].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));
  return (
    <div class="card">
      {ranked.map((s) => (
        <div key={s.id} class={`row ${s.is_winner ? 'win' : ''}`} style="justify-content:space-between">
          <span>{s.placement}. {s.name}</span>
          <span>{s.final_score ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
