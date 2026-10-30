import { describe, expect, it, vi } from 'vitest';
import { GameSession, type GameAction } from '../../src/core/session';
import { findPossibleMoves } from '../../src/core/moves';
import { handleGameRequest } from '../../src/server/gameServer';

const env = { url: 'https://demo.supabase.co', key: 'sb_secret_test' };
const SESSION_ID = '11111111-2222-3333-4444-555555555555';
const SEED = 7;

const dbAnswer = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const post = (body: unknown) =>
  new Request('https://demo.supabase.co/functions/v1/smooth-handler', {
    method: 'POST',
    headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
    body: JSON.stringify(body),
  });

function fairGame(): { actions: GameAction[]; score: number } {
  const session = new GameSession(SEED, 5);
  const drain = (steps: Generator<unknown, void, undefined>) => {
    let next = steps.next();
    while (!next.done) next = steps.next();
  };
  while (!session.isOver) {
    const { from, to } = findPossibleMoves(session.board)[0]!;
    drain(session.play({ type: 'swap', from, to }));
    session.shuffleIfStuck();
  }
  drain(session.finale());
  return { actions: session.actions, score: session.score };
}

/** База: отвечает по имени вызванной функции */
function database(answers: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const name = String(url).split('/rpc/')[1]!;
    return dbAnswer(answers[name]);
  }) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };
}

const rpcBody = (fetchFn: { mock: { calls: [string, RequestInit][] } }, name: string) => {
  const call = fetchFn.mock.calls.find(([url]) => String(url).endsWith(name))!;
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
};

describe('серверная проверка партии', () => {
  it('выдаёт билет с серверным seed и передаёт IP игрока', async () => {
    const fetchFn = database({ start_game_session: SESSION_ID });
    const response = await handleGameRequest(
      post({ action: 'start', difficulty: 'hard' }),
      env,
      fetchFn,
    );
    const body = (await response.json()) as { id: string; seed: number };
    expect(body.id).toBe(SESSION_ID);
    expect(Number.isInteger(body.seed)).toBe(true);
    const args = rpcBody(fetchFn, 'start_game_session');
    expect(args).toEqual({ p_ip: '9.9.9.9', p_difficulty: 'hard', p_seed: body.seed });
  });

  it('новый ключ sb_secret идёт только в apikey', async () => {
    const fetchFn = database({ start_game_session: SESSION_ID });
    await handleGameRequest(post({ action: 'start', difficulty: 'hard' }), env, fetchFn);
    const headers = fetchFn.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_test');
    expect(headers.Authorization).toBeUndefined();
  });

  it('лимит партий — билета нет', async () => {
    const fetchFn = database({ start_game_session: null });
    const response = await handleGameRequest(
      post({ action: 'start', difficulty: 'hard' }),
      env,
      fetchFn,
    );
    expect(response.status).toBe(429);
  });

  it('неизвестная сложность — запрос до базы не доходит', async () => {
    const fetchFn = database({});
    const response = await handleGameRequest(
      post({ action: 'start', difficulty: 'god' }),
      env,
      fetchFn,
    );
    expect(response.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('записывает очки, посчитанные сервером, а не присланные браузером', async () => {
    const { actions, score } = fairGame();
    const fetchFn = database({
      claim_game_session: [{ seed: SEED, difficulty: 'medium' }],
      submit_verified_result: 42,
    });
    const response = await handleGameRequest(
      post({ action: 'finish', id: SESSION_ID, name: ' Аня ', actions, score: 999999 }),
      env,
      fetchFn,
    );
    expect(await response.json()).toEqual({ entryId: 42, score });
    expect(rpcBody(fetchFn, 'submit_verified_result')).toEqual({
      p_ip: '9.9.9.9',
      p_difficulty: 'medium',
      p_name: 'Аня',
      p_score: score,
    });
  });

  it('подделанный журнал не записывается', async () => {
    const { actions } = fairGame();
    const fetchFn = database({ claim_game_session: [{ seed: SEED + 1, difficulty: 'medium' }] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await handleGameRequest(
      post({ action: 'finish', id: SESSION_ID, name: 'Аня', actions }),
      env,
      fetchFn,
    );
    warn.mockRestore();
    expect(await response.json()).toEqual({ reason: 'invalid' });
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes('submit'))).toBe(false);
  });

  it('повторная отправка билета отклоняется', async () => {
    const fetchFn = database({ claim_game_session: [] });
    const response = await handleGameRequest(
      post({ action: 'finish', id: SESSION_ID, name: 'Аня', actions: [] }),
      env,
      fetchFn,
    );
    expect(await response.json()).toEqual({ reason: 'invalid' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('журнал неправильного вида до базы не доходит', async () => {
    const fetchFn = database({});
    const response = await handleGameRequest(
      post({ action: 'finish', id: SESSION_ID, name: 'Аня', actions: [{ type: 'нет' }] }),
      env,
      fetchFn,
    );
    expect(await response.json()).toEqual({ reason: 'journal' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('билет неправильного вида до базы не доходит', async () => {
    const fetchFn = database({});
    const response = await handleGameRequest(
      post({ action: 'finish', id: "1'; drop table", name: 'Аня', actions: [] }),
      env,
      fetchFn,
    );
    expect(await response.json()).toEqual({ reason: 'invalid' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('лимит частоты: партия верна, но запись отброшена', async () => {
    const { actions, score } = fairGame();
    const fetchFn = database({
      claim_game_session: [{ seed: SEED, difficulty: 'medium' }],
      submit_verified_result: null,
    });
    const response = await handleGameRequest(
      post({ action: 'finish', id: SESSION_ID, name: 'Аня', actions }),
      env,
      fetchFn,
    );
    expect(await response.json()).toEqual({ reason: 'limit', score });
  });

  it('браузер получает разрешения CORS на предварительный запрос', async () => {
    const response = await handleGameRequest(
      new Request('https://demo.supabase.co/functions/v1/smooth-handler', { method: 'OPTIONS' }),
      env,
      database({}),
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('apikey');
  });
});
