import { useEffect } from 'preact/hooks';

/** Keeps the screen on while active. Silently does nothing where unsupported. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        lock?.release().catch(() => {});
        lock = next;
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, [active]);
}
