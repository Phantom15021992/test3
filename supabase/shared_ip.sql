-- Защита от частой отправки без наказания за общий IP.
-- Выполнить в Supabase пятым, после leaderboard.sql, rate_limit.sql, top10.sql и game_results.sql:
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.
-- Если потом перевыполнить любой из этих файлов — этот нужно выполнить снова, он заменяет их проверки.
--
-- Почему: за одним IP сидит вся организация, и две партии в одну минуту — обычное дело.
-- Правило «чаще раза в минуту — удалить всё и забанить» наказывало обычных игроков.
--
-- Новые правила (одинаковы для таблицы лидеров и для game_results):
--   1) до 10 отправок с IP в минуту — всё принимается;
--   2) сверх этого лишние записи молча отбрасываются, остальные результаты не трогаются;
--   3) 60 отправок с IP за 10 минут — явный спам: IP блокируется на сутки, удаляются только
--      его записи за эти 10 минут, более старые остаются;
--   4) всё, что уходит из таблицы лидеров, копируется в архив — потерять запись насовсем нельзя.
--
-- Сейчас действующие блокировки снимаются (см. конец файла).

-- Архив удалённых записей. Доступ из браузера закрыт, смотреть — в Supabase. Хранится 90 дней.
create table if not exists public.leaderboard_archive (
  id bigint not null,
  difficulty text not null,
  name text not null,
  score integer not null,
  ip text,
  created_at timestamptz not null,
  deleted_at timestamptz not null default now()
);
create index if not exists leaderboard_archive_deleted
  on public.leaderboard_archive (deleted_at);
alter table public.leaderboard_archive enable row level security;
revoke all on public.leaderboard_archive from anon, authenticated;

create or replace function public.leaderboard_to_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from leaderboard_archive a where a.deleted_at < now() - interval '90 days';
  insert into leaderboard_archive (id, difficulty, name, score, ip, created_at)
    values (old.id, old.difficulty, old.name, old.score, old.ip, old.created_at);
  return old;
end;
$$;

drop trigger if exists leaderboard_to_archive on public.leaderboard;
create trigger leaderboard_to_archive
  after delete on public.leaderboard
  for each row execute function public.leaderboard_to_archive();

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

  -- Старые отметки журнала больше не нужны (проверки смотрят последние 10 минут)
  delete from leaderboard_submissions s where s.created_at < now() - interval '1 day';

  -- IP заблокирован — результат не принимается
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return null;
  end if;

  -- Отмечаем каждую попытку, в том числе отброшенную: иначе спам не дошёл бы до порога блокировки
  insert into leaderboard_submissions (ip) values (v_ip);

  -- Явный спам — блокируем и убираем только свежие записи этого IP
  if (
    select count(*) from leaderboard_submissions s
    where s.ip = v_ip and s.created_at > now() - interval '10 minutes'
  ) >= 60 then
    delete from leaderboard l
    where l.ip = v_ip and l.created_at > now() - interval '10 minutes';
    insert into leaderboard_bans (ip, banned_until)
      values (v_ip, now() + interval '1 day')
      on conflict (ip) do update set banned_until = excluded.banned_until;
    return null;
  end if;

  -- Лимит в минуту превышен — отбрасываем только эту запись
  if (
    select count(*) from leaderboard_submissions s
    where s.ip = v_ip and s.created_at > now() - interval '1 minute'
  ) > 10 then
    return null;
  end if;

  return new;
end;
$$;

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

  -- Заблокирован за спам в таблицу лидеров — не пишем
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return null;
  end if;

  insert into game_results_submissions (ip) values (v_ip);

  -- Лимит в минуту превышен — молча отбрасываем
  if (
    select count(*) from game_results_submissions s
    where s.ip = v_ip and s.created_at > now() - interval '1 minute'
  ) > 10 then
    return null;
  end if;

  return new;
end;
$$;

-- Снимаем блокировки, выданные по старому правилу
delete from public.leaderboard_bans;
