// Восстановление результатов из локальной таблицы браузера.
// Открыть игру на компьютере игрока (https://phantom15021992.github.io/test3/), нажать F12 →
// Console, вставить весь файл и нажать Enter. Ничего не меняет и никуда не отправляет:
// только собирает готовый SQL и кладёт его в буфер обмена.
// Этот SQL затем выполняется в Supabase → SQL Editor (записи, которые уже есть, пропускаются).
/* global localStorage, console, copy */
(() => {
  const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
  const rows = [];
  for (const difficulty of ['kids', 'easy', 'medium', 'hard', 'hell']) {
    const raw = localStorage.getItem(`match3.leaderboard.${difficulty}`);
    for (const { name, score, playedAt } of raw ? JSON.parse(raw) : []) {
      const time = new Date(playedAt).toISOString();
      rows.push(`(${quote(difficulty)}, ${quote(name)}, ${Number(score)}, ${quote(time)})`);
    }
  }
  if (rows.length === 0) {
    console.log('На этом компьютере нет сохранённых результатов');
    return;
  }
  const sql = `insert into public.leaderboard (difficulty, name, score, created_at)
select v.difficulty, v.name, v.score, v.created_at::timestamptz
from (values
${rows.join(',\n')}
) as v(difficulty, name, score, created_at)
where not exists (
  select 1 from public.leaderboard l
  where l.difficulty = v.difficulty and l.name = v.name and l.score = v.score
);`;
  copy(sql);
  console.log(`Результатов: ${rows.length}. SQL скопирован в буфер обмена:\n\n${sql}`);
})();
