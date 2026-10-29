-- Общая таблица лидеров для игры «Три в ряд».
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить весь файл → Run.

create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  difficulty text not null check (difficulty in ('kids', 'easy', 'medium', 'hard', 'hell')),
  name text not null check (char_length(name) between 1 and 16),
  -- Грубая защита от выдуманных результатов: за 35 ходов столько не набрать
  score integer not null check (score between 0 and 1000000),
  created_at timestamptz not null default now()
);

-- Быстрый выбор десятки лучших по сложности
create index if not exists leaderboard_top
  on public.leaderboard (difficulty, score desc, created_at);

-- Доступ из браузера (роль anon): читать всё, добавлять только имя/очки/сложность.
-- Время и номер записи ставит сервер; менять и удалять записи нельзя.
alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard read" on public.leaderboard;
create policy "leaderboard read" on public.leaderboard
  for select to anon using (true);

drop policy if exists "leaderboard insert" on public.leaderboard;
create policy "leaderboard insert" on public.leaderboard
  for insert to anon with check (true);

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to anon;
grant insert (difficulty, name, score) on public.leaderboard to anon;
