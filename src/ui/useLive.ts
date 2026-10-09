import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Re-runs the Dexie query whenever the tables it reads change. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: (v) => setValue(() => v), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
