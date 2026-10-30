-- Таблица лидеров хранит только 10 лучших записей на каждую сложность.
-- Выполнить в Supabase после leaderboard.sql и rate_limit.sql:
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.
-- ВНИМАНИЕ: проверка частоты здесь заменена в shared_ip.sql — после этого файла выполните его снова.
--
-- Что делает:
--   1) удаляет навсегда все записи, не входящие в десятку своей сложности;
--   2) после каждой новой записи удаляет то, что выпало из десятки;
--   3) проверку «не чаще раза в минуту с одного IP» переводит на отдельный журнал отправок —
--      иначе слабый результат сразу удалялся бы из таблицы и повторную отправку было бы не поймать.

-- Журнал отправок для проверки частоты. Из браузера недоступен; старше суток — чистится.
create table if not exists public.leaderboard_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists leaderboard_submissions_ip_time
  on public.leaderboard_submissions (ip, created_at);
alter table public.leaderboard_submissions enable row level security;
revoke all on public.leaderboard_submissions from anon, authenticated;

-- Проверка частоты — теперь по журналу отправок
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

  -- Старые отметки журнала больше не нужны (проверка смотрит только последнюю минуту)
  delete from leaderboard_submissions s where s.created_at < now() - interval '1 day';

  -- IP заблокирован — результат не принимается
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return null;
  end if;

  -- С этого IP уже отправляли за последнюю минуту — удаляем всё и блокируем на сутки
  if exists (
    select 1 from leaderboard_submissions s
    where s.ip = v_ip and s.created_at > now() - interval '1 minute'
  ) then
    delete from leaderboard l where l.ip = v_ip;
    insert into leaderboard_bans (ip, banned_until)
      values (v_ip, now() + interval '1 day')
      on conflict (ip) do update set banned_until = excluded.banned_until;
    return null;
  end if;

  insert into leaderboard_submissions (ip) values (v_ip);
  return new;
end;
$$;

-- После новой записи оставляем в её сложности только десятку лучших
-- (по очкам, при равенстве — кто раньше)
create or replace function public.leaderboard_keep_top() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from leaderboard l
  where l.difficulty = new.difficulty
    and l.id not in (
      select t.id from leaderboard t
      where t.difficulty = new.difficulty
      order by t.score desc, t.created_at asc
      limit 10
    );
  return null;
end;
$$;

drop trigger if exists leaderboard_keep_top on public.leaderboard;
create trigger leaderboard_keep_top
  after insert on public.leaderboard
  for each row execute function public.leaderboard_keep_top();

-- Разовая чистка: всё, что сейчас вне десятки своей сложности
delete from public.leaderboard l
using (
  select id, row_number() over (
    partition by difficulty order by score desc, created_at asc
  ) as place
  from public.leaderboard
) ranked
where l.id = ranked.id and ranked.place > 10;
