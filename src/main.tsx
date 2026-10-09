import { registerSW } from 'virtual:pwa-register';
import { render } from 'preact';
import { ensureBuiltInGames } from './db/actions';
import { onAuthChange } from './sync/auth';
import { requestSync, startSyncLoop } from './sync/runner';
import { remote } from './sync/supabaseClient';
import { App } from './ui/App';
import './ui/styles.css';

ensureBuiltInGames().finally(() => {
  render(<App />, document.getElementById('app')!);
  startSyncLoop(remote);
  onAuthChange(() => requestSync(0));
});

// A new version is applied only from Home; elsewhere it waits for the next cold start, so an update never interrupts a game.
const updateSW = registerSW({
  onNeedRefresh() {
    const h = location.hash;
    if (h === '' || h === '#' || h === '#/') updateSW(true);
  },
});

// Ask the browser not to evict the local database; the result is irrelevant.
try {
  void navigator.storage?.persist?.()?.catch(() => {});
} catch {
  // ignore
}
