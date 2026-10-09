import { loadExportRows } from '../../db/queries';
import { shareOrDownload, toCsv } from '../../export/csv';
import { LoginForm } from '../LoginForm';
import { PlayersEditor } from '../PlayersEditor';

export function Settings() {
  return (
    <>
      <h2>Konto og sync</h2>
      <LoginForm />
      <h2>Spillere</h2>
      <PlayersEditor />
      <h2>Eksport</h2>
      <div class="card stack">
        <button
          onClick={async () => shareOrDownload('spilscore-resultater.csv', toCsv((await loadExportRows()).results))}
        >
          Resultater (CSV)
        </button>
        <button onClick={async () => shareOrDownload('spilscore-point.csv', toCsv((await loadExportRows()).entries))}>
          Alle indtastede point (CSV)
        </button>
      </div>
    </>
  );
}
