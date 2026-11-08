import { MusicPlayer } from './musicPlayer';
import { trackLength, type Track } from './musicScore';
import { LEVEL_TRACKS, MENU_TRACKS } from './musicTracks';

// Страница отбора музыки (music-lab.html, только npm run dev): у каждой композиции — слушать с начала,
// «конец» (последние 20 секунд и переход к следующей) и повтор одной композиции. Номера — М1…, У1…

const END_PREVIEW = 20;

let player: MusicPlayer | null = null;
const getPlayer = () => {
  // Браузер разрешает звук только после нажатия: проигрыватель создаётся по первому клику
  if (!player) {
    player = new MusicPlayer();
    player.volume = Number((document.getElementById('volume') as HTMLInputElement).value);
  }
  void player.ctx.resume();
  return player;
};

const format = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const list = document.getElementById('list')!;
const now = document.getElementById('now')!;

function group(title: string, prefix: string, tracks: readonly Track[]) {
  const h = document.createElement('h2');
  h.textContent = title;
  const all = document.createElement('button');
  all.textContent = '▶ все подряд';
  all.addEventListener('click', () => getPlayer().play([...tracks]));
  h.append(' ', all);
  list.append(h);
  tracks.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'title';
    name.innerHTML = `<span class="num">${prefix}${i + 1}</span>${track.title} <span class="len">${format(
      trackLength(track),
    )} · ${track.bpm} уд/мин</span>`;
    row.append(name);
    const buttons: [string, () => void][] = [
      ['▶ слушать', () => getPlayer().play([...tracks], { index: i })],
      [
        '⏭ конец и переход',
        () =>
          getPlayer().play([...tracks], {
            index: i,
            offset: Math.max(0, trackLength(track) - END_PREVIEW),
          }),
      ],
      [
        '🔁 по кругу',
        () =>
          getPlayer().play([track], {
            loopOne: true,
            offset: Math.max(0, trackLength(track) - END_PREVIEW),
          }),
      ],
    ];
    for (const [label, action] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', action);
      row.append(b);
    }
    list.append(row);
  });
}

group('Меню — спокойные', 'М', MENU_TRACKS);
group('Уровни — живее', 'У', LEVEL_TRACKS);

document.getElementById('stop')!.addEventListener('click', () => player?.stop());
document.getElementById('volume')!.addEventListener('input', (event) => {
  if (player) player.volume = Number((event.target as HTMLInputElement).value);
});

const numberOf = (track: Track) => {
  const m = MENU_TRACKS.indexOf(track);
  return m >= 0 ? `М${m + 1}` : `У${LEVEL_TRACKS.indexOf(track) + 1}`;
};

setInterval(() => {
  const p = player?.position();
  now.textContent = p
    ? `Играет ${numberOf(p.track)} «${p.track.title}» — ${format(Math.min(p.time, p.length))} из ${format(p.length)}`
    : 'Тишина';
}, 250);
