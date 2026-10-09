-- Built-in games added 2026-10-09: UNO, Minigolf, Mexican Train.
-- Run once in Supabase → SQL Editor BEFORE playing these games, otherwise their sessions cannot sync.
insert into public.games (id, owner_id, created_at, updated_at, key, name, type, config, built_in) values
  ('00000000-0000-4000-8000-000000000006', null, now(), now(), 'uno', 'UNO', 'open_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000007', null, now(), now(), 'minigolf', 'Minigolf', 'fixed_rounds', '{}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000008', null, now(), now(), 'mexicantrain', 'Mexican Train', 'fixed_rounds', '{}'::jsonb, true)
on conflict (id) do nothing;
