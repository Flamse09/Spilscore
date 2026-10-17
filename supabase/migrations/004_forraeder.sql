-- Built-in game added 2026-10-16: Forræder.
-- Run once in Supabase → SQL Editor BEFORE playing it, otherwise its sessions cannot sync.
insert into public.games (id, owner_id, created_at, updated_at, key, name, type, config, built_in) values
  ('00000000-0000-4000-8000-000000000009', null, now(), now(), 'forraeder', 'Forræder', 'result_only', '{}'::jsonb, true)
on conflict (id) do nothing;
