-- Spilscore: schema, RLS, grants, results view, built-in games.
-- Run once in Supabase → SQL Editor.

create table public.players (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  archived boolean not null default false
);

create table public.games (
  id uuid primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  key text not null,
  name text not null,
  type text not null check (type in ('open_rounds', 'fixed_rounds', 'scoresheet', 'result_only')),
  config jsonb not null,
  built_in boolean not null default false,
  unique (key)
);

create table public.sessions (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  game_id uuid not null references public.games(id),
  options jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('in_progress', 'finished', 'abandoned')),
  note text
);

create table public.session_teams (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  name text not null,
  seat int not null
);

create table public.session_players (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  player_id uuid not null references public.players(id),
  team_id uuid references public.session_teams(id),
  seat int not null,
  final_score numeric,
  placement int,
  is_winner boolean
);

create table public.score_entries (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id uuid not null references public.sessions(id),
  player_id uuid references public.players(id),
  team_id uuid references public.session_teams(id),
  round_no int,
  category text,
  points numeric not null,
  check ((player_id is null) <> (team_id is null))
);

create index on public.players (owner_id, updated_at);
create index on public.games (owner_id, updated_at);
create index on public.sessions (owner_id, updated_at);
create index on public.session_teams (owner_id, updated_at);
create index on public.session_players (owner_id, updated_at);
create index on public.score_entries (owner_id, updated_at);
create index on public.session_players (session_id);
create index on public.score_entries (session_id);

-- Newest updated_at wins: an upsert carrying an older copy of a row is silently ignored.
create function public.keep_newest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger keep_newest before update on public.players for each row execute function public.keep_newest();
create trigger keep_newest before update on public.games for each row execute function public.keep_newest();
create trigger keep_newest before update on public.sessions for each row execute function public.keep_newest();
create trigger keep_newest before update on public.session_teams for each row execute function public.keep_newest();
create trigger keep_newest before update on public.session_players for each row execute function public.keep_newest();
create trigger keep_newest before update on public.score_entries for each row execute function public.keep_newest();

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.sessions enable row level security;
alter table public.session_teams enable row level security;
alter table public.session_players enable row level security;
alter table public.score_entries enable row level security;

create policy own_select on public.players for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_insert on public.players for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy own_update on public.players for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_select on public.sessions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_insert on public.sessions for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy own_update on public.sessions for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_select on public.session_teams for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_insert on public.session_teams for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy own_update on public.session_teams for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_select on public.session_players for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_insert on public.session_players for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy own_update on public.session_players for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_select on public.score_entries for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_insert on public.score_entries for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy own_update on public.score_entries for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy read_games on public.games for select to anon, authenticated
  using (built_in or owner_id = (select auth.uid()));
create policy insert_own_games on public.games for insert to authenticated
  with check (owner_id = (select auth.uid()) and not built_in);
create policy update_own_games on public.games for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and not built_in);

-- Supabase default privileges grant ALL on new tables; strip them so there is no DELETE anywhere (deletion is soft).
revoke all on public.players, public.games, public.sessions, public.session_teams, public.session_players, public.score_entries from anon, authenticated;
grant select, insert, update on
  public.players, public.games, public.sessions, public.session_teams, public.session_players, public.score_entries
  to authenticated;
grant select on public.games to anon;

create view public.v_results with (security_invoker = true) as
select
  s.id as session_id,
  g.name as game_name,
  s.started_at,
  s.ended_at,
  p.name as player_name,
  t.name as team_name,
  sp.final_score,
  sp.placement,
  sp.is_winner,
  count(*) over (partition by s.id) as player_count
from public.session_players sp
join public.sessions s on s.id = sp.session_id
join public.games g on g.id = s.game_id
join public.players p on p.id = sp.player_id
left join public.session_teams t on t.id = sp.team_id
where s.status = 'finished' and s.deleted_at is null and sp.deleted_at is null;

revoke all on public.v_results from anon, authenticated;
grant select on public.v_results to authenticated;

insert into public.games (id, owner_id, created_at, updated_at, key, name, type, config, built_in) values
  ('00000000-0000-4000-8000-000000000001', null, now(), now(), 'yatzy', 'Yatzy', 'scoresheet', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000002', null, now(), now(), '500', '500', 'open_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000003', null, now(), now(), 'flip7', 'Flip 7', 'open_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000004', null, now(), now(), 'davoserjas', 'Davoserjas', 'fixed_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000005', null, now(), now(), 'hitster', 'Hitster', 'result_only', '{}'::jsonb, true);
