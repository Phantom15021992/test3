-- Кампания: анонимная статистика попыток и коды переноса прогресса.
-- Выполнить в Supabase после всех остальных файлов (седьмым):
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.

-- ---------- Попытки уровней ----------
-- Каждая попытка: победа, поражение или уход на карту. Имени и IP в таблице нет.
-- Из браузера можно только добавлять записи, читать — в Supabase (SQL Editor, Table Editor).

create table if not exists public.level_results (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level_id integer not null check (level_id between 1 and 10000),
  outcome text not null check (outcome in ('won', 'lost', 'left')),
  stars integer not null check (stars between 0 and 3),
  moves_made integer not null check (moves_made between 0 and 1000),
  moves_left integer not null check (moves_left between 0 and 1000),
  goals_percent integer not null check (goals_percent between 0 and 100),
  shuffles integer not null check (shuffles between 0 and 1000),
  duration_sec integer not null check (duration_sec between 0 and 86400),
  stars_spent integer not null check (stars_spent between 0 and 1000),
  bought_bomb integer not null check (bought_bomb between 0 and 1000),
  bought_rocket integer not null check (bought_rocket between 0 and 1000),
  bought_manipulator integer not null check (bought_manipulator between 0 and 1000),
  bought_rainbow integer not null check (bought_rainbow between 0 and 1000),
  device text not null check (device in ('touch', 'desktop')),
  screen_width integer not null check (screen_width between 0 and 20000),
  screen_height integer not null check (screen_height between 0 and 20000),
  version text not null check (char_length(version) between 1 and 40)
);

create index if not exists level_results_level_time
  on public.level_results (level_id, created_at);

alter table public.level_results enable row level security;
drop policy if exists "level results insert" on public.level_results;
create policy "level results insert" on public.level_results
  for insert to anon with check (true);
revoke all on public.level_results from anon, authenticated;
grant insert (
  level_id, outcome, stars, moves_made, moves_left, goals_percent, shuffles, duration_sec,
  stars_spent, bought_bomb, bought_rocket, bought_manipulator, bought_rainbow,
  device, screen_width, screen_height, version
) on public.level_results to anon;

-- Журнал запросов с IP: отдельно от данных, чтобы в самой статистике IP не было. Хранится сутки
create table if not exists public.campaign_requests (
  ip text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_requests_ip_time
  on public.campaign_requests (ip, kind, created_at);
alter table public.campaign_requests enable row level security;
revoke all on public.campaign_requests from anon, authenticated;

-- true — запрос с этого IP в пределах нормы. Вызывающая функция сама решает, что делать с лишним
create or replace function public.campaign_allow(p_kind text, p_per_minute integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.leaderboard_client_ip();
begin
  -- Запрос не из браузера (SQL Editor, импорт) — без проверок
  if v_ip is null then
    return true;
  end if;
  delete from campaign_requests r where r.created_at < now() - interval '1 day';
  if exists (select 1 from leaderboard_bans b where b.ip = v_ip and b.banned_until > now()) then
    return false;
  end if;
  if (
    select count(*) from campaign_requests r
    where r.ip = v_ip and r.kind = p_kind and r.created_at > now() - interval '1 minute'
  ) >= p_per_minute then
    return false;
  end if;
  insert into campaign_requests (ip, kind) values (v_ip, p_kind);
  return true;
end;
$$;
revoke all on function public.campaign_allow(text, integer) from public, anon, authenticated;

create or replace function public.level_results_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- За одним IP бывает несколько игроков, а уровни короткие: лишнее молча отбрасываем
  return case when public.campaign_allow('level', 60) then new else null end;
end;
$$;

drop trigger if exists level_results_guard on public.level_results;
create trigger level_results_guard
  before insert on public.level_results
  for each row execute function public.level_results_guard();

-- ---------- Коды переноса прогресса ----------
-- Прогресс живёт в браузере, здесь лежит только копия для переноса на другое устройство.
-- Таблицу из браузера не прочитать: только функциями ниже и только зная код.
-- Код живёт год с последнего использования. Подобрать его мешают длина (8 символов из 32,
-- это около триллиона вариантов) и лимит запросов с IP. Внутри только звёзды, личных данных нет.

create table if not exists public.progress_transfers (
  code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.progress_transfers enable row level security;
revoke all on public.progress_transfers from anon, authenticated;

-- gen_random_uuid — криптостойкий источник. Байты 6 и 8 в нём не случайны, поэтому их не берём
create or replace function public.progress_new_code() returns text
language plpgsql set search_path = public as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
  v_index integer;
begin
  foreach v_index in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    v_code := v_code || substr(v_alphabet, get_byte(v_bytes, v_index) % 32 + 1, 1);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.progress_new_code() from public, anon, authenticated;

-- Сохраняет копию. p_code — код этого игрока, если он уже есть: он останется тем же.
-- Возвращает код; null — данные неверного вида или слишком частые запросы
create or replace function public.save_progress(p_data jsonb, p_code text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 8192 then
    return null;
  end if;
  if not public.campaign_allow('progress_save', 10) then
    return null;
  end if;
  delete from progress_transfers t where t.updated_at < now() - interval '1 year';

  update progress_transfers t set data = p_data, updated_at = now()
    where t.code = p_code
    returning t.code into v_code;
  if v_code is not null then
    return v_code;
  end if;

  for attempt in 1..5 loop
    v_code := public.progress_new_code();
    insert into progress_transfers (code, data) values (v_code, p_data)
      on conflict (code) do nothing;
    if found then
      return v_code;
    end if;
  end loop;
  return null;
end;
$$;

-- Копия по коду; null — такого кода нет или слишком частые запросы
create or replace function public.load_progress(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_data jsonb;
begin
  if not public.campaign_allow('progress_load', 20) then
    return null;
  end if;
  update progress_transfers t set updated_at = now()
    where t.code = p_code and t.updated_at > now() - interval '1 year'
    returning t.data into v_data;
  return v_data;
end;
$$;

revoke all on function public.save_progress(jsonb, text) from public;
revoke all on function public.load_progress(text) from public;
grant execute on function public.save_progress(jsonb, text) to anon;
grant execute on function public.load_progress(text) to anon;
