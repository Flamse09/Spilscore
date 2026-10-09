import type { GameRecord } from '../stats/records';
import { formatDate } from './points';

export function RecordList({ records, nameOf }: { records: GameRecord[]; nameOf: (id: string) => string }) {
  return (
    <>
      {records.map((r) => (
        <div key={r.key} class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span class="muted">{r.title}</span>
          <span style="text-align:right">
            <strong>{r.value}</strong> · {r.holders.map(nameOf).join(', ')}
            {r.date && <span class="muted small"> · {formatDate(r.date)}</span>}
          </span>
        </div>
      ))}
    </>
  );
}
