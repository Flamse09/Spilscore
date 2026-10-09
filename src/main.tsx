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
