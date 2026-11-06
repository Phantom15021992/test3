-- Ходы попыток уровней кампании — анонимно, для калибровки бота по живым игрокам.
-- Выполняется восьмым, после campaign.sql (нужна функция campaign_allow).
--
-- Строка — одна попытка: уровень, версия игры (коммит, по нему достаётся поле уровня из git),
-- seed попытки, звёзды этажа на её начало и журнал действий. По ним попытка проигрывается заново
-- (src/core/levelReplay.ts), и в каждой позиции видно, какой ход сделал человек, а какой выбрал бы
-- бот (scripts/humanMoves.ts). Имени и IP нет. Из браузера — только добавление.
-- Отдельно от level_results: пока этой таблицы нет, запись итогов попыток не ломается.

create table if not exists public.level_moves (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level_id integer not null check (level_id between 1 and 10000),
  version text not null check (char_length(version) between 1 and 40),
  seed bigint not null check (seed between 0 and 4294967295),
  wallet integer not null check (wallet between 0 and 100000),
  outcome text not null check (outcome in ('won', 'lost', 'left')),
  moves_made integer not null check (moves_made between 0 and 1000),
  -- Журнал короткий: до 45 ходов и несколько покупок. Предел — защита от мусора
  actions jsonb not null check (
    jsonb_typeof(actions) = 'array'
    and jsonb_array_length(actions) <= 400
    and octet_length(actions::text) <= 40000
  )
);

create index if not exists level_moves_level_time on public.level_moves (level_id, created_at);

alter table public.level_moves enable row level security;
drop policy if exists "level moves insert" on public.level_moves;
create policy "level moves insert" on public.level_moves for insert to anon with check (true);
revoke all on public.level_moves from anon, authenticated;
grant insert (level_id, version, seed, wallet, outcome, moves_made, actions)
  on public.level_moves to anon;

create or replace function public.level_moves_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Как у level_results: лишнее с одного IP молча отбрасываем
  return case when public.campaign_allow('moves', 60) then new else null end;
end;
$$;

drop trigger if exists level_moves_guard on public.level_moves;
create trigger level_moves_guard
  before insert on public.level_moves
  for each row execute function public.level_moves_guard();
