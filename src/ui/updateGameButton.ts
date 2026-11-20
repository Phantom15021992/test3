import Phaser from 'phaser';
import { createMenuButton, menuButtonLabel } from './menuButton';

const UPDATE_FONT_SIZE = 24;
const UPDATE_LABEL = 'Обновить\nигру';
/** Метка в адресе после обновления: страница грузится заново мимо кэша, при запуске метка убирается */
export const UPDATE_PARAM = 'update';

/**
 * Загружает последнюю версию игры. Картинки и код сборки названы по содержимому, поэтому устаревшей
 * бывает только сама страница — её берём с сервера мимо кэша браузера. Прогресс кампании, рекорды
 * и настройки лежат в localStorage этого сайта и при перезагрузке не трогаются
 */
export async function reloadLatestVersion(): Promise<void> {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete(UPDATE_PARAM);
  try {
    // Обновляет копию страницы в кэше браузера, чтобы и обычный заход дальше открывал новую версию
    await fetch(url.toString(), { cache: 'reload' });
  } catch {
    // Нет связи — всё равно перезагружаемся: браузер покажет, что есть
  }
  url.searchParams.set(UPDATE_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

/** Убирает метку обновления из адреса после загрузки, чтобы она не попадала в закладки */
export function clearUpdateParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(UPDATE_PARAM)) return;
  url.searchParams.delete(UPDATE_PARAM);
  window.history.replaceState(null, '', url.toString());
}

/** Кнопка «Обновить игру» на экране правил */
export function addUpdateGameButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const text = menuButtonLabel(scene, UPDATE_LABEL, UPDATE_FONT_SIZE).setAlign('center');
  let busy = false;
  createMenuButton(
    scene,
    x,
    y,
    [text],
    () => {
      if (busy) return;
      busy = true;
      text.setText('Обновляю…');
      void reloadLatestVersion();
    },
    width,
    height,
  );
}
