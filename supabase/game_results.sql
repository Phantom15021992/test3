-- Все доигранные партии — анонимно, для качественного и количественного анализа.
-- Выполнить в Supabase после leaderboard.sql, rate_limit.sql и top10.sql:
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Имени игрока и IP в таблице нет. Из браузера в неё можно только добавлять записи —
-- читать её можно в Supabase (SQL Editor, Table Editor).
-- Защита: с одного IP — не чаще одной записи в минуту (лишние молча отбрасываются);
-- IP, заблокированные за частую отправку в таблицу лидеров, сюда тоже не пишут.

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  difficulty text not null check (difficulty in ('kids', 'easy', 'medium', 'hard', 'hell')),
  score integer not null check (score between 0 and 1000000),
  moves_made integer not null check (moves_made between 0 and 1000),
  duration_sec integer not null check (duration_sec between 0 and 86400),
  finale_points integer not null check (finale_points between 0 and 1000000),
  shuffles integer not null check (shuffles between 0 and 1000),
  level2_created integer not null check (level2_created between 0 and 100000),
  level3_created integer not null check (level3_created between 0 and 100000),
  specials_from_matches integer not null check (specials_from_matches between 0 and 100000),
  specials_activated integer not null check (specials_activated between 0 and 100000),
  bought_bomb integer not null check (bought_bomb between 0 and 10000),
  bought_rocket integer not null check (bought_rocket between 0 and 10000),
  bought_manipulator integer not null check (bought_manipulator between 0 and 10000),
  bought_rainbow integer not null check (bought_rainbow between 0 and 10000),
  points_spent integer not null check (points_spent between 0 and 10000000),
  device text not null check (device in ('touch', 'desktop')),
  screen_width integer not null check (screen_width between 0 and 20000),
  screen_height integer not null check (screen_height between 0 and 20000),
  version text not null check (char_length(version) between 1 and 40)
);

create index if not exists game_results_difficulty_time
  on public.game_results (difficulty, created_at);

-- Доступ из браузера: только добавлять перечисленные столбцы
alter table public.game_results enable row level security;
drop policy if exists "game results insert" on public.game_results;
create policy "game results insert" on public.game_results
  for insert to anon with check (true);
revoke all on public.game_results from anon, authenticated;
grant insert (
  difficulty, score, moves_made, duration_sec, finale_points, shuffles,
  level2_created, level3_created, specials_from_matches, specials_activated,
  bought_bomb, bought_rocket, bought_manipulator, bought_rainbow, points_spent,
  device, screen_width, screen_height, version
) on public.game_results to anon;

-- Свой журнал отправок (отдельно от таблицы лидеров: запись партии и сохранение имени
-- идут одна за другой, и общий журнал счёл бы это частой отправкой)
create table if not exists public.game_results_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists game_results_submissions_ip_time
  on public.game_results_submissions (ip, created_at);
alter table public.game_results_submissions enable row level security;
revoke all on public.game_results_submissions from anon, authenticated;

create or replace function public.game_results_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.leaderboard_client_ip();
begin
  -- Запрос не из браузера (импорт, правка в Table Editor) — без проверок
  if v_ip is null then
    return new;
  end if;

  delete from game_results_submissions s where s.created_at < now() - interval '1 day';

  -- Заблокирован за частую отправку в таблицу лидеров — не пишем
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return null;
  end if;

  -- С этого IP уже писали партию за последнюю минуту — молча отбрасываем
  if exists (
    select 1 from game_results_submissions s
    where s.ip = v_ip and s.created_at > now() - interval '1 minute'
  ) then
    return null;
  end if;

  insert into game_results_submissions (ip) values (v_ip);
  return new;
end;
$$;

drop trigger if exists game_results_guard on public.game_results;
create trigger game_results_guard
  before insert on public.game_results
  for each row execute function public.game_results_guard();
