-- Защита общей таблицы лидеров от частой отправки результатов.
-- Выполнить в Supabase после leaderboard.sql: SQL Editor → New query → вставить весь файл → Run.
-- Файл можно выполнять повторно — он ничего не ломает.
--
-- Правило: если с одного IP результат приходит чаще раза в минуту —
--   1) все результаты с этого IP удаляются навсегда;
--   2) IP блокируется на сутки (результаты с него в это время не принимаются);
--   3) сама новая запись не сохраняется.
-- Отклонённая запись не вызывает ошибку (иначе база откатила бы и удаление, и блокировку):
-- запрос проходит, но в ответе нет новой строки — по этому игра понимает, что результат не принят.

-- IP, с которого пришёл результат. Из браузера его не прочитать и не подставить.
alter table public.leaderboard add column if not exists ip text;
create index if not exists leaderboard_ip_time on public.leaderboard (ip, created_at);

-- Заблокированные IP. Доступ из браузера закрыт полностью.
create table if not exists public.leaderboard_bans (
  ip text primary key,
  banned_until timestamptz not null
);
alter table public.leaderboard_bans enable row level security;
revoke all on public.leaderboard_bans from anon, authenticated;

-- Браузер читает только безопасные столбцы — без IP
revoke select on public.leaderboard from anon;
grant select (id, difficulty, name, score, created_at) on public.leaderboard to anon;

-- IP клиента из заголовков запроса. Сначала заголовки, которые ставит сам прокси Supabase
-- (их не подделать из браузера), затем — первый адрес из X-Forwarded-For.
create or replace function public.leaderboard_client_ip() returns text
language plpgsql stable as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
begin
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

create or replace function public.leaderboard_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.leaderboard_client_ip();
begin
  -- Запрос не из браузера (например, правка в Table Editor) — без проверок
  if v_ip is null then
    return new;
  end if;
  new.ip := v_ip;

  -- IP заблокирован — результат не принимается
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return null;
  end if;

  -- Результат с этого IP уже был за последнюю минуту — удаляем всё и блокируем на сутки
  if exists (
    select 1 from leaderboard l where l.ip = v_ip and l.created_at > now() - interval '1 minute'
  ) then
    delete from leaderboard l where l.ip = v_ip;
    insert into leaderboard_bans (ip, banned_until)
      values (v_ip, now() + interval '1 day')
      on conflict (ip) do update set banned_until = excluded.banned_until;
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists leaderboard_guard on public.leaderboard;
create trigger leaderboard_guard
  before insert on public.leaderboard
  for each row execute function public.leaderboard_guard();
