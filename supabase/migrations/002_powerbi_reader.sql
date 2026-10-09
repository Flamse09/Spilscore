-- Read-only login for Power BI.
-- Set the password separately, never commit it: alter role powerbi_reader password '<your password>';
create role powerbi_reader login;
grant usage on schema public to powerbi_reader;
grant select on
  public.players, public.games, public.sessions, public.session_teams,
  public.session_players, public.score_entries, public.v_results
  to powerbi_reader;

create policy powerbi_read on public.players for select to powerbi_reader using (true);
create policy powerbi_read on public.games for select to powerbi_reader using (true);
create policy powerbi_read on public.sessions for select to powerbi_reader using (true);
create policy powerbi_read on public.session_teams for select to powerbi_reader using (true);
create policy powerbi_read on public.session_players for select to powerbi_reader using (true);
create policy powerbi_read on public.score_entries for select to powerbi_reader using (true);
