import { exportProgress, mergeProgress, parseProgress } from './progress';
import { withRetries, type RemoteConfig } from './remoteLeaderboard';

// Перенос прогресса между устройствами по короткому коду (см. supabase/campaign.sql).
// Сам прогресс остаётся в браузере: сервер нужен только в момент переноса.
// У игрока один код на все устройства, поэтому перед сохранением копия с сервера вливается
// в местный прогресс: иначе устройство с меньшим прогрессом затёрло бы то, что новее.

const CODE_KEY = 'match3.transferCode';
const ATTEMPTS = 3;
const TIMEOUT_MS = 8000;
export const TRANSFER_CODE_LENGTH = 8;

export function loadTransferCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveTransferCode(code: string): void {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    // Без хранилища код надо вводить заново
  }
}

/** Игрок мог ввести код строчными буквами или с пробелами */
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Запрос JSON с заголовком: это вызов функции базы, и без предварительного запроса CORS никак */
async function callDatabase(
  config: RemoteConfig,
  name: string,
  args: unknown,
  fetchFn: typeof fetch,
): Promise<unknown> {
  return withRetries(ATTEMPTS, TIMEOUT_MS, async (signal) => {
    const response = await fetchFn(`${config.url}/rest/v1/rpc/${name}?apikey=${config.key}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`База ответила ${response.status}`);
    return response.json();
  });
}

async function fetchCopy(
  config: RemoteConfig,
  code: string,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const data = await callDatabase(config, 'load_progress', { p_code: code }, fetchFn);
  const copy = parseProgress(data);
  if (copy) mergeProgress(copy);
  return copy !== null;
}

/** Сохраняет копию прогресса; возвращает код или null, если сервер отказал */
export async function saveToCode(
  config: RemoteConfig,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const known = loadTransferCode();
  if (known) await fetchCopy(config, known, fetchFn);
  const code = await callDatabase(
    config,
    'save_progress',
    { p_data: exportProgress(), p_code: known || null },
    fetchFn,
  );
  if (typeof code !== 'string') return null;
  saveTransferCode(code);
  return code;
}

/** Загружает прогресс по коду и добавляет к местному; false — такого кода нет */
export async function loadFromCode(
  config: RemoteConfig,
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const found = await fetchCopy(config, code, fetchFn);
  if (found) saveTransferCode(code);
  return found;
}
