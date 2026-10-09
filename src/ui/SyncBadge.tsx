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
      return `Sync fejlede${waiting}`;
    case 'syncing':
      return 'Synkroniserer';
    default:
      return s.pending ? `${s.pending} venter` : 'Synkroniseret';
  }
}

/** Dot colour: green = in sync, blue = working, orange = failed, grey = offline or signed out. */
function tone(s: SyncStatus): string {
  if (s.state === 'error') return 'bad';
  if (s.state === 'signed-out' || s.state === 'offline') return 'off';
  return s.pending || s.state === 'syncing' ? 'busy' : 'ok';
}

export function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getStatus());
  useEffect(() => subscribe(setS), []);
  return (
    <span class={`badge pill ${tone(s)}`} title={s.lastError ?? ''}>
      <span class="dot" />
      {label(s)}
    </span>
  );
}
