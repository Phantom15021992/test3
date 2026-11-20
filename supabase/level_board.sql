-- Таблица лидеров уровней кампании: ник, звёзды, ходы и очки лучшей победы игрока на уровне.
-- Выполнить в Supabase после всех остальных файлов (девятым; нужен campaign.sql — campaign_allow):
-- SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Итог присылает сама игра, сервер его не проверяет (так решил владелец): подделать запрос можно.
-- Игрок узнаётся по случайному id из его браузера, а не по нику: сменил ник — его строки те же.
-- Порядок: больше звёзд, меньше ходов, больше очков; при равенстве выше тот, кто был раньше.
-- Таблицу из браузера не прочитать напрямую: только функциями ниже, и id игроков они не отдают.

create table if not exists public.level_board (
  level_id integer not null check (level_id between 1 and 10000),
  player_id text not null check (char_length(player_id) between 8 and 64),
  name text not null check (char_length(name) between 1 and 16),
  stars integer not null check (stars between 1 and 3),
  moves integer not null check (moves between 0 and 1000),
  score integer not null check (score between 0 and 100000000),
  updated_at timestamptz not null default now(),
  primary key (level_id, player_id)
);
create index if not exists level_board_rank
  on public.level_board (level_id, stars desc, moves asc, score desc, updated_at asc);
alter table public.level_board enable row level security;
revoke all on public.level_board from anon, authenticated;

-- Десятка лучших уровня и строка этого игрока, если он ниже. me — строка этого игрока
create or replace function public.level_board_read(p_level integer, p_player text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select b.name, b.stars, b.moves, b.score, b.player_id = p_player as me,
      row_number() over (order by b.stars desc, b.moves asc, b.score desc, b.updated_at asc) as rank
    from level_board b
    where b.level_id = p_level
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank, 'name', r.name, 'stars', r.stars, 'moves', r.moves, 'score', r.score,
      'me', r.me
    ) order by r.rank), '[]'::jsonb)
  from ranked r
  where r.rank <= 10 or r.me;
$$;

-- Записывает победу, если она лучше прошлой этого игрока (ник обновляется всегда), и отдаёт таблицу
create or replace function public.level_board_submit(
  p_level integer,
  p_player text,
  p_name text,
  p_stars integer,
  p_moves integer,
  p_score integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 16);
begin
  if v_name = '' then
    v_name := 'Игрок';
  end if;
  -- За одним IP бывает несколько игроков, а уровни короткие: лишнее молча не записываем
  if public.campaign_allow('board', 60) then
    insert into level_board as b (level_id, player_id, name, stars, moves, score)
    values (p_level, p_player, v_name, p_stars, p_moves, p_score)
    on conflict (level_id, player_id) do update
      set name = excluded.name,
        stars = case when (excluded.stars, -excluded.moves, excluded.score)
          > (b.stars, -b.moves, b.score) then excluded.stars else b.stars end,
        moves = case when (excluded.stars, -excluded.moves, excluded.score)
          > (b.stars, -b.moves, b.score) then excluded.moves else b.moves end,
        score = case when (excluded.stars, -excluded.moves, excluded.score)
          > (b.stars, -b.moves, b.score) then excluded.score else b.score end,
        updated_at = case when (excluded.stars, -excluded.moves, excluded.score)
          > (b.stars, -b.moves, b.score) then now() else b.updated_at end;
  end if;
  return public.level_board_read(p_level, p_player);
end;
$$;

revoke all on function public.level_board_read(integer, text) from public;
revoke all on function public.level_board_submit(integer, text, text, integer, integer, integer)
  from public;
grant execute on function public.level_board_read(integer, text) to anon;
grant execute on function public.level_board_submit(integer, text, text, integer, integer, integer)
  to anon;
