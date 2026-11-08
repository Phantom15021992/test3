import { SOUND_CATALOG } from './soundCatalog';
import { Synth } from './synth';

// Страница отбора звуков (sound-lab.html, только npm run dev): у каждого действия кнопки вариантов.
// Звуки, которые растут по шагам (комбо, звёзды), проигрываются всей цепочкой.

const LETTERS = [
  'а',
  'б',
  'в',
  'г',
  'д',
  'е',
  'ж',
  'з',
  'и',
  'к',
  'л',
  'м',
  'н',
  'о',
  'п',
  'р',
  'с',
  'т',
];
const STEP_GAP_MS = 380;

let synth: Synth | null = null;
const getSynth = () => {
  // Браузер разрешает звук только после нажатия, поэтому движок создаётся по первому клику
  synth ??= new Synth();
  void synth.ctx.resume();
  return synth;
};

const list = document.getElementById('list')!;
let group = '';
for (const entry of SOUND_CATALOG) {
  if (entry.group !== group) {
    group = entry.group;
    const h = document.createElement('h2');
    h.textContent = group;
    list.append(h);
  }
  const row = document.createElement('div');
  row.className = 'row';
  const title = document.createElement('span');
  title.className = 'title';
  title.innerHTML = `<span class="num">${entry.code ?? entry.id}</span>${entry.title}`;
  row.append(title);
  entry.variants.forEach((recipe, i) => {
    const button = document.createElement('button');
    const chosen = entry.chosen === i;
    const label =
      entry.variants.length === 1
        ? (entry.code ?? String(entry.id))
        : `${entry.code ?? entry.id}${LETTERS[i]}`;
    button.textContent = `${chosen ? (entry.doubtful ? '?' : '✓') : '▶'} ${label}`;
    if (chosen) button.className = entry.doubtful ? 'chosen doubtful' : 'chosen';
    if (chosen && entry.doubtful) button.title = 'Выбран, но под сомнением, нужен ли звук';
    button.addEventListener('click', () => {
      const s = getSynth();
      const steps = entry.steps ?? 1;
      for (let k = 1; k <= steps; k++) setTimeout(() => recipe(s, k), (k - 1) * STEP_GAP_MS);
    });
    row.append(button);
  });
  list.append(row);
}

document.getElementById('volume')!.addEventListener('input', (event) => {
  getSynth().volume = Number((event.target as HTMLInputElement).value);
});
