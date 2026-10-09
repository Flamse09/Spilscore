import { useState } from 'preact/hooks';
import { loadExportRows } from '../../db/queries';
import { shareOrDownload, toCsv } from '../../export/csv';
import { LoginForm } from '../LoginForm';
import { PlayersEditor } from '../PlayersEditor';

export function Settings() {
  const [error, setError] = useState<string | null>(null);

  async function exportCsv(filename: string, pick: 'results' | 'entries') {
    setError(null);
    try {
      await shareOrDownload(filename, toCsv((await loadExportRows())[pick]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h2>Konto og sync</h2>
      <LoginForm />
      <h2>Spillere</h2>
      <PlayersEditor />
      <h2>Eksport</h2>
      <div class="card stack">
        <button onClick={() => exportCsv('spilscore-resultater.csv', 'results')}>Resultater (CSV)</button>
        <button onClick={() => exportCsv('spilscore-point.csv', 'entries')}>Alle indtastede point (CSV)</button>
        {error && <p class="warn">Eksport fejlede: {error}</p>}
      </div>
    </>
  );
}
