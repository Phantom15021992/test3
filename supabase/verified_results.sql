-- Запись в таблицу лидеров — только через проверку партии на сервере.
-- Выполнить в Supabase шестым, после всех остальных файлов (shared_ip.sql — обязательно):
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.
-- Сначала разверните функцию smooth-handler: пока её нет, результаты не будут попадать в общую таблицу.
--
-- Как это работает:
--   1) перед партией функция smooth-handler выдаёт случайный seed и запоминает его здесь;
--   2) после партии она получает журнал действий, сама проигрывает партию и считает очки;
--   3) записать результат может только она. Прямое добавление из браузера закрыто.
-- Функции ниже доступны только с секретным ключом, который есть лишь у функции smooth-handler.

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null check (seed between 0 and 4294967295),
  difficulty text not null check (difficulty in ('kids', 'easy', 'medium', 'hard', 'hell')),
  ip text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists game_sessions_ip_time on public.game_sessions (ip, created_at);
alter table public.game_sessions enable row level security;
revoke all on public.game_sessions from anon, authenticated;

-- Запись приходит с адреса сервера функции, поэтому IP игрока она передаёт явно
create or replace function public.leaderboard_client_ip() returns text
language plpgsql stable as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := nullif(current_setting('app.client_ip', true), '');
begin
  if v_ip is not null then
    return v_ip;
  end if;
  if headers is null then
    return null;
  end if;
  return coalesce(
    nullif(headers ->> 'cf-connecting-ip', ''),
    nullif(headers ->> 'x-real-ip', ''),
    nullif(trim(split_part(headers ->> 'x-forwarded-for', ',', 1)), '')
  );
end;
$$;

-- Новая партия. null — IP заблокирован или слишком много партий подряд (30 в минуту):
-- игра тогда идёт без билета, и результат остаётся только на устройстве.
create or replace function public.start_game_session(
  p_ip text, p_difficulty text, p_seed bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  delete from game_sessions s where s.created_at < now() - interval '1 day';
  if exists (select 1 from leaderboard_bans b where b.ip = p_ip and b.banned_until > now()) then
    return null;
  end if;
  if (
    select count(*) from game_sessions s
    where s.ip = p_ip and s.created_at > now() - interval '1 minute'
  ) >= 30 then
    return null;
  end if;
  insert into game_sessions (seed, difficulty, ip)
    values (p_seed, p_difficulty, p_ip)
    returning id into v_id;
  return v_id;
end;
$$;

-- Гасит билет: срабатывает один раз. Партия с анимациями не короче 10 секунд,
-- билет живёт сутки. Обновление атомарно: две одновременные отправки не пройдут обе.
create or replace function public.claim_game_session(p_id uuid)
returns table (seed bigint, difficulty text)
language sql security definer set search_path = public as $$
  update game_sessions s
  set used_at = now()
  where s.id = p_id
    and s.used_at is null
    and s.created_at < now() - interval '10 seconds'
    and s.created_at > now() - interval '1 day'
  returning s.seed, s.difficulty;
$$;

-- Записывает проверенный результат. null — запись отброшена лимитом частоты (leaderboard_guard).
create or replace function public.submit_verified_result(
  p_ip text, p_difficulty text, p_name text, p_score integer
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  perform set_config('app.client_ip', p_ip, true);
  insert into leaderboard (difficulty, name, score)
    values (p_difficulty, p_name, p_score)
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.start_game_session(text, text, bigint) from public, anon, authenticated;
revoke all on function public.claim_game_session(uuid) from public, anon, authenticated;
revoke all on function public.submit_verified_result(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.start_game_session(text, text, bigint) to service_role;
grant execute on function public.claim_game_session(uuid) to service_role;
grant execute on function public.submit_verified_result(text, text, text, integer) to service_role;

-- Закрываем прямую запись из браузера: остаётся только чтение
drop policy if exists "leaderboard insert" on public.leaderboard;
revoke insert on public.leaderboard from anon, authenticated;
