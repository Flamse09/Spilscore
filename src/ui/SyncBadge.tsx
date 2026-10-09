import { useEffect, useState } from 'preact/hooks';
import { getStatus, subscribe, type SyncStatus } from '../sync/runner';

function label(s: SyncStatus): string {
  const waiting = s.pending ? ` · ${s.pending} venter` : '';
  switch (s.state) {
    case 'signed-out':
      return `Ikke logget ind${waiting}`;
    case 'offline':
      return `Offline${waiting}`;
    case 'error':
      return `⚠ Sync fejlede${waiting}`;
    case 'syncing':
      return '⟳ Synkroniserer';
    default:
      return s.pending ? `⟳${waiting}` : '✓ Synkroniseret';
  }
}

export function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getStatus());
  useEffect(() => subscribe(setS), []);
  return <span class="badge" title={s.lastError ?? ''}>{label(s)}</span>;
}
