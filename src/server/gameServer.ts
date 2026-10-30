import { DIFFICULTIES } from '../core/config';
import { parseActions, replayGame } from '../core/session';
import { normalizeName } from '../storage/leaderboard';

// Серверная часть таблицы лидеров (Supabase Edge Function, сборка — npm run build:function).
// Браузеру записывать очки нельзя: сервер выдаёт seed партии, а в конце получает журнал действий,
// сам проигрывает партию и записывает посчитанный им результат. Подделать можно только запрос,
// а очки здесь берутся не из запроса.

export interface ServerEnv {
  url: string;
  /** Секретный ключ: живёт только в окружении функции Supabase, в проект не попадает */
  key: string;
}

type FetchFn = typeof fetch;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Вызов функции базы; функции закрыты для браузера и доступны только с секретным ключом */
async function rpc(
  env: ServerEnv,
  name: string,
  args: Record<string, unknown>,
  fetchFn: FetchFn,
): Promise<unknown> {
  // Старый ключ service_role — это JWT; новый sb_secret_ передаётся только в apikey
  const bearer = env.key.startsWith('eyJ') ? { Authorization: `Bearer ${env.key}` } : undefined;
  const response = await fetchFn(`${env.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.key, 'Content-Type': 'application/json', ...bearer },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`База ответила ${response.status} на ${name}`);
  return response.json();
}

/** IP игрока: запись в базу идёт с адреса сервера, поэтому передаём его явно */
function clientIp(request: Request): string {
  const { headers } = request;
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

async function start(
  request: Request,
  body: Record<string, unknown>,
  env: ServerEnv,
  fetchFn: FetchFn,
): Promise<Response> {
  const difficulty = DIFFICULTIES.find((d) => d.id === body.difficulty);
  if (!difficulty) return json({ error: 'difficulty' }, 400);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const id = await rpc(
    env,
    'start_game_session',
    { p_ip: clientIp(request), p_difficulty: difficulty.id, p_seed: seed },
    fetchFn,
  );
  return typeof id === 'string' ? json({ id, seed }) : json({ error: 'limit' }, 429);
}

async function finish(
  request: Request,
  body: Record<string, unknown>,
  env: ServerEnv,
  fetchFn: FetchFn,
): Promise<Response> {
  const actions = parseActions(body.actions);
  if (!actions || typeof body.id !== 'string' || !SESSION_ID.test(body.id)) {
    return json({ reason: 'invalid' });
  }
  // Билет гасится до проверки: один и тот же seed нельзя отправить дважды
  const claimed = await rpc(env, 'claim_game_session', { p_id: body.id }, fetchFn);
  const session = Array.isArray(claimed)
    ? (claimed[0] as { seed: number; difficulty: string } | undefined)
    : undefined;
  const difficulty = DIFFICULTIES.find((d) => d.id === session?.difficulty);
  if (!session || !difficulty) return json({ reason: 'invalid' });

  const score = replayGame(session.seed, difficulty.colors, actions);
  if (score === null) {
    console.warn(`Журнал партии ${body.id} не прошёл проверку`);
    return json({ reason: 'invalid' });
  }
  const name = normalizeName(typeof body.name === 'string' ? body.name : '');
  const entryId = await rpc(
    env,
    'submit_verified_result',
    { p_ip: clientIp(request), p_difficulty: difficulty.id, p_name: name, p_score: score },
    fetchFn,
  );
  return typeof entryId === 'number' ? json({ entryId, score }) : json({ reason: 'limit', score });
}

export async function handleGameRequest(
  request: Request,
  env: ServerEnv,
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'start') return await start(request, body, env, fetchFn);
    if (body.action === 'finish') return await finish(request, body, env, fetchFn);
    return json({ error: 'action' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: 'server' }, 500);
  }
}
