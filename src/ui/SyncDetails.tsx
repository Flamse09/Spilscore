import { useEffect, useState } from 'preact/hooks';
import { getStatus, subscribe, syncNow, type SyncState, type SyncStatus } from '../sync/runner';

const STATE_LABEL: Record<SyncState, string> = {
  idle: 'Synkroniseret',
  syncing: 'Synkroniserer…',
  offline: 'Offline',
  error: 'Fejl',
  'signed-out': 'Ikke logget ind',
};

export function SyncDetails() {
  const [s, setS] = useState<SyncStatus>(getStatus());
  useEffect(() => {
    setS(getStatus());
    return subscribe(setS);
  }, []);
  return (
    <div class="card stack">
      <div>Status: <strong>{STATE_LABEL[s.state]}</strong></div>
      <div>Venter på sync: <strong>{s.pending}</strong></div>
      {s.lastError && <p class="warn" style="margin:0">{s.lastError}</p>}
      <button onClick={() => syncNow()}>Synkronisér nu</button>
    </div>
  );
}
