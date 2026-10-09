# SDD ledger — plan: docs/superpowers/plans/2026-10-09-spilscore.md
Spec: docs/superpowers/specs/2026-10-09-spilscore-design.md
Branch: build/v1 (from main @ 019474f). Repo: C:\Users\frede\Code\Spilscore

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 .gitignore vs SDD workspace | T1 ignore list vs `.superpowers/` scratch | `.superpowers/` not ignored → Ruling below |
| T2 types → T4 davoserjas | CheckKind incl. 'all' | consistent |
| T2 builtins → T4 results test | 7 Davoserjas round keys | consistent (a total 12) |
| T3 yatzy → T4 results / T12 sheet | yatzyCategories, yatzyTotals, validValues, YATZY_BONUS, Dice | consistent |
| T4 results → T5 actions, T11 FinishPrompt/RoundsBoard | computeResults, isGameOver, diceOf | consistent |
| T5 stats.ts ResultRow → T8 stats | T8 replaces file keeping ResultRow | consistent |
| T5 schema/repo → T6 sync | db, SYNC_TABLES, BaseRow, TableName | consistent |
| T6 RemoteClient/PULL_PAGE → T7 adapter | interface + const | consistent |
| T7 auth → T9 LoginForm/main | sendCode/verifyCode/signOut/onAuthChange | consistent |
| T9 App.tsx → T10/11/14 route wiring | Screen switch edits | consistent; T14 removes default |
| T9 Settings → T13 CustomGames insert | before "Eksport" | consistent |
| T11 Play placeholders → T12/T13 replace, T15 wake lock | exact placeholder strings | consistent |
| T15 vite.config/tsconfig/main.tsx edits vs T1/T9 versions | full replacement / single-line edits | consistent |
| T1..T15 self-consistency | tests vs code checked by controller (yatzy values, csv quoting, davoserjas sums, results totals) | consistent |
| T7 step 8, T15 steps 9-10, T16 | Frederik-only actions (SQL in Supabase, push, Pages, iPhone) | Ruling below |
| UI manual browser checks (T9-T14) | implementer verification | Ruling below |

Ruling: T1 adds `.superpowers/` to .gitignore — SDD scratch must never be committed — cost if wrong: one extra ignore line.
Ruling: Implementers never `git push`; T7 step 8 (run SQL, email template), T15 steps 9-10 (push, Pages) and T16 are deferred to Frederik/controller at finish — pushing/publishing is outward-facing and the build lives on branch build/v1 — cost if wrong: deploy happens a little later.
Ruling: UI tasks are verified by implementers with `npm test` + `npm run build`; controller does a browser smoke test of the running app after T14 — subagents may lack the browser pane — cost if wrong: UI bugs caught later, at the smoke test.
Ruling: Node 24 is installed (plan says 22) — fully compatible; CI stays on 22 — cost if wrong: none expected.

## Progress
Ruling: Accept new dependency majors installed by npm (preact 11, typescript 7, vite 8, vitest 5, vite-plugin-pwa 2) — build+tests pass; pinning older majors would fight npm defaults — cost if wrong: API drift surfaces in later tasks and needs small adaptations.
Task 1: minor (deferred): vite-plugin-pwa 2 / assets-generator 2 untested with vite 8 until Task 15.
Task 1: complete (commits 019474f..d50904f, review clean)
Ruling: Co-Authored-By trailers name the model that actually committed (e.g. Haiku 5.5) — accurate attribution beats a uniform trailer — cost if wrong: cosmetic commit-message differences.
Task 2: minor (deferred): placement tests lack low-scoring tie/empty/no-mutation cases; builtins tests only check Davoserjas keys.
Task 2: complete (commits d50904f..a5f9e25, review clean)
Task 3: minor (deferred): validValues returns the cached array (mutation risk); scoreDice doesn't validate dice range; 6-dice combo tests thin.
Task 3: complete (commits a5f9e25..b6cf17a, review clean)
Ruling: Davoserjas 'all' sum set is a cross product (slightly over-permissive, e.g. 64 with 3 players) — kept as planned; it only drives a soft warning and the spec says warnings never block — cost if wrong: a rare mistyped round-6 sum passes without a warning.
Task 4: minor (deferred): computeResults uses s.team_id! (mixed team/no-team seats would collapse); result_only participants missing from manual tie at last place; isGameOver fixed_rounds vacuous true for 0 seats.
Task 4: complete (commits b6cf17a..dff1262, review clean)
Ruling: Task 5 loadExportRows sorts seats by seat — the plan's test assumed seat order that toArray() (UUID order) doesn't give; seat order is the natural export order — cost if wrong: none.
Ruling: startSession/finishSession span several save() transactions (plan-mandated, reviewer graded Minor) — accepted for v1; finish self-heals on next save, a seatless session after a mid-write kill is only a cosmetic orphan — cost if wrong: rare orphan session row; fix = wrap in one db.transaction.
Task 5: minor (deferred): export sort should be started_at/session/seat (rows interleave across sessions); results.find(...)! unguarded; addPlayer/addCustomGame return pre-stamp row; undoLastSheetEntry same-ms ties; finishSession keeps abandon ended_at; no tests for soft-delete exclusion in queries, undoLastSheetEntry, abandon/setNote/updatePlayer. Process: no RED run recorded.
Task 5: complete (commits dff1262..93cba54, review clean)
Ruling: T6 Important 1 (push has no newest-wins guard) — fix server-side in Task 7's migration with a BEFORE UPDATE trigger that skips updates whose NEW.updated_at < OLD.updated_at; push stays unconditional — spec's newest-wins then holds on both sides — cost if wrong: one trigger function to remove.
Ruling: T6 Important 2 (writes during an in-flight sync wait 60 s) — fix in fix round 1 with a pending/dirty flag re-running after the current sync; also request a sync whenever the outbox count is >0 and changed — cost if wrong: an extra sync call.
Task 6: minor (deferred): startSyncLoop not idempotent; push upsert unchunked; pull truncation if >1000 rows share one updated_at; runner syncNow untested; sync tests lack pagination/built-in-pull/partial-failure/soft-delete cases.
Task 6: fix round 1/5 (1 addressed, 0 open — in-flight sync re-request; commits 4b52456..4fa4f1d)
Task 6: minor (deferred): runner test leaves module listeners/timers alive and unstubs globals only on success.
Task 6: complete (commits 93cba54..4fa4f1d, review clean; push newest-wins carried to Task 7 as server trigger)
Ruling: T7 reviewer Minors 1 (grants don't restrict; hard DELETE possible via REST) and 2 (usable placeholder password in public repo) upgraded to fix-now — security hardening, cheap, and the SQL hasn't been run yet — cost if wrong: a few extra SQL lines.
Task 7: minor (deferred): cross-user FK references possible (existence leak only); normalize test doesn't assert started_at/ended_at; pull cursor on client updated_at can miss late-pushed older rows (whole-branch review).
Ruling: Task 8 dispatched while Task 7 fix round 1 ran (disjoint files: SQL vs src/stats; Task 8 stages only its own paths) — saves wall-clock — cost if wrong: interleaved commits; review packages use per-commit ranges.
Task 7: fix round 1/5 (2 addressed, 0 open — revoke default grants + split own_rows policies; Power BI role without committed password; commits 3c79ff6..6fe208b)
Task 7: complete (commits 4fa4f1d..6fe208b, review clean)
Task 8: minor (deferred): stats tests miss null-placement h2h, favoriteGame tie, summarize played tiebreak, maxRoundScore null player, low-scoring avg; summarize relies on caller filtering finished games.
Task 8: complete (commits 6fe208b..94e5144, review clean)
Ruling: T9 plan-mandated Importants (download fallback revokes URL before the download / anchor not attached; share-cancel AbortError and export failures unhandled) — fix now in round 1; also add \t and \r to the CSV formula guard (cheap) — export is the user's data escape hatch — cost if wrong: small extra code.
Task 9: minor (deferred): empty export downloads empty file; PlayersEditor rejected rename leaves stale input text; LoginForm has no in-flight state (double taps); sync error only in title tooltip (invisible on iOS); only newest in-progress session gets "Fortsæt".
Ruling: T10 plan-mandated Important (stale teamOf index > teamCount crashes startSession) — fix in round 1 with modulo normalisation; also fold in Minor 2 (reset busy + Danish error on failure) — cheap, prevents a dead Start button — cost if wrong: none.
Task 10: minor (deferred): teamOf not cleared on deselect; default team shifts when earlier player deselected; quick-add ignores duplicates/maxPlayers; chips lack aria-pressed.
Task 9: fix round 1/5 (3 addressed, 0 open — download fallback, share cancel/error UI, formula guard; commits 7b9ed0c..779135b)
Task 9: complete (commits 94e5144..d930c4e + 779135b, review clean)
Task 10: fix round 1/5 (2 addressed, 0 open — team index modulo, start error handling; commits 74df50d..7b9ed0c)
Task 10: complete (commits d930c4e..74df50d + 7b9ed0c, review clean)
Task 11: minor (deferred): `rounds.length && ...` class can render 0; leader highlighted with winner style mid-game; labels not tied to inputs; backdrop tap discards input; FinishPrompt/SessionMenu async without catch; "Afslut nu" with zero rounds.
Task 11: complete (commits 779135b..b16395d, review clean)
Task 12: minor (deferred): CSS `table.score tr.tap` doesn't match `td.tap` in YatzySheet (no pointer cue); setSheetValue awaits without catch; undo targets most recently edited cell.
Task 12: complete (commits b16395d..e35d388, review clean)
Ruling: "Længste sejrsstime" is correct Danish (sejrsstime = winning streak), kept — cost if wrong: one label.
Ruling: T13 reviewer Important (History/Stats filter out soft-deleted custom games, so "Fjern" hides their history and Stats shows "?") lives in Task 14 files — fix it in Task 14's fix round (or the final fix wave): filters and name lookups use all games, only "Nyt spil" hides deleted games — cost if wrong: removed games show in filters.
Task 13: minor (deferred): "Vinder" resets other placements to 2; invalid/negative points silently clear; scoring setting unused for result-only placement; save errors uncaught; ResultEntry state not keyed by session id.
Task 13: complete (commits e35d388..9eef3e1, review clean)
Task 14: minor (deferred): selected player persists across game filter change; history filters can't reach deleted game/player (see T13 ruling — goes to final fix wave as Important).
Task 14: complete (commits 9eef3e1..49ab24e, review clean)
Task 15: minor (deferred): keepalive uses third-party action on mutable @v2 tag with actions:write (fix in final wave: replace with gh api enable call); wake lock acquire/cleanup race.
Task 15: complete (commits 49ab24e..b2757cf, review clean)
Controller smoke test (dev server, mobile viewport): Davoserjas 7 rounds with correct warnings (r1 16 vs 17, r6 66 vs list), finish+banner OK; Yatzy 6 dice 20 fields, 4'ere picker 0..24, Maxi 0/100, bonus 84; Hitster 2 teams, team placement copied to members; Stats/History render; no console errors.
Smoke finding: RoundEntry onInput uses `{...values, [pid]: v}` from closure — simultaneous programmatic inputs drop values (real typing fine). Fix in final wave with functional setState.
Final review (opus): 0 Critical, 5 Important (OTP template for first signup; write errors not shown; sync error invisible on iPhone; queued (a) deleted-game filters (b) keepalive action + twice-weekly cron; RoundEntry functional setState). Assessment: ready after fixes.
Ruling: final fix wave also takes cheap minors — single-transaction read-modify-write in saveRound/setSheetValue (double-tap duplicates), RoundEntry backdrop no longer discards input, SW update applies only on Home route, unique games.key, navigator.storage.persist(), ResultEntry key=session.id, wake-lock release race, signup-disable made a required checklist step — each is a few lines and protects data/usability at the table — cost if wrong: small extra diff.
Ruling: server-stamped synced_at pull cursor deferred — sound for the spec's single phone; two-client staleness only affects the second client's view, never server data — cost if wrong: Safari-vs-PWA views can go stale until fixed.
Final fix wave: complete (commits b2757cf..c538dc7, re-review all 12 addressed); minor (deferred): YatzySheet stale error after cancel; PlayersEditor input keeps failed rename text.
