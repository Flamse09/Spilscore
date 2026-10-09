import { useState } from 'preact/hooks';
import { setSheetValue, undoLastSheetEntry, type SessionBundle } from '../db/actions';
import { diceOf } from '../games/results';
import { validValues, yatzyCategories, yatzyTotals, YATZY_BONUS, type YatzyCategory } from '../games/yatzy';
import { FinishPrompt } from './FinishPrompt';

export function YatzySheet({ bundle }: { bundle: SessionBundle }) {
  const { session, seats, entries } = bundle;
  const dice = diceOf(session.options);
  const cats = yatzyCategories(dice);
  const [pick, setPick] = useState<{ playerId: string; name: string; cat: YatzyCategory } | null>(null);
  const editable = session.status !== 'abandoned';
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, closePicker: boolean) {
    setError(null);
    try {
      await action();
      if (closePicker) setPick(null);
    } catch (e) {
      setError(`Kunne ikke gemme: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const filled = new Map(
    seats.map((s) => [
      s.player_id,
      Object.fromEntries(entries.filter((e) => e.player_id === s.player_id && e.category).map((e) => [e.category!, e.points])) as Record<string, number>,
    ]),
  );
  const totals = new Map(seats.map((s) => [s.player_id, yatzyTotals(dice, filled.get(s.player_id)!)]));

  const row = (cat: YatzyCategory) => (
    <tr key={cat.key}>
      <td>{cat.label}</td>
      {seats.map((s) => {
        const v = filled.get(s.player_id)![cat.key];
        return (
          <td key={s.id} class={editable ? 'tap' : ''} onClick={() => editable && setPick({ playerId: s.player_id, name: s.name, cat })}>
            {v === undefined ? '' : v === 0 ? '–' : v}
          </td>
        );
      })}
    </tr>
  );

  return (
    <>
      <div class="scroll-x">
        <table class="score">
          <thead>
            <tr>
              <th>{dice} terninger</th>
              {seats.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {cats.filter((c) => c.section === 'upper').map(row)}
            <tr>
              <td class="muted">Sum (bonus ved {YATZY_BONUS[dice].threshold})</td>
              {seats.map((s) => <td key={s.id} class="muted">{totals.get(s.player_id)!.upper}</td>)}
            </tr>
            <tr>
              <td class="muted">Bonus</td>
              {seats.map((s) => <td key={s.id} class="muted">{totals.get(s.player_id)!.bonus}</td>)}
            </tr>
            {cats.filter((c) => c.section === 'lower').map(row)}
            <tr class="total">
              <td>I alt</td>
              {seats.map((s) => <td key={s.id}>{totals.get(s.player_id)!.total}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div class="stack" style="margin-top:12px">
        {session.status === 'in_progress' && entries.length > 0 && (
          <button onClick={() => run(() => undoLastSheetEntry(session.id), false)}>Fortryd sidste</button>
        )}
        {!pick && error && <p class="warn" style="margin:0">{error}</p>}
        <FinishPrompt bundle={bundle} />
      </div>
      {pick && (
        <div class="overlay" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div class="sheet stack">
            <h2 style="margin-top:0">{pick.name}: {pick.cat.label}</h2>
            <div class="grid4">
              {validValues(dice, pick.cat.key).map((v) => (
                <button
                  key={v}
                  class={filled.get(pick.playerId)![pick.cat.key] === v ? 'primary' : ''}
                  onClick={() => run(() => setSheetValue(session.id, pick.playerId, pick.cat.key, v), true)}
                >
                  {v === 0 ? '– (0)' : v}
                </button>
              ))}
            </div>
            {filled.get(pick.playerId)![pick.cat.key] !== undefined && (
              <button
                onClick={() => run(() => setSheetValue(session.id, pick.playerId, pick.cat.key, null), true)}
              >
                Ryd felt
              </button>
            )}
            {error && <p class="warn" style="margin:0">{error}</p>}
            <button onClick={() => setPick(null)}>Annullér</button>
          </div>
        </div>
      )}
    </>
  );
}
