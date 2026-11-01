import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportProgress,
  floorWallet,
  loadLevelStars,
  mergeProgress,
  parseProgress,
  saveLevelStars,
  saveLevelSpending,
} from '../../src/storage/progress';
import { loadFromCode, normalizeCode, saveToCode } from '../../src/storage/transfer';

const config = { url: 'https://example.test', key: 'public-key' };

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});

/** Сервер с одной записью: как таблица progress_transfers */
function fakeServer(start: Record<string, unknown> = {}) {
  const codes = new Map(Object.entries(start));
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    let answer: unknown = null;
    if (String(url).includes('load_progress')) answer = codes.get(String(body.p_code)) ?? null;
    if (String(url).includes('save_progress')) {
      const code = String(body.p_code ?? 'NEWCODE2');
      codes.set(code, body.p_data);
      answer = code;
    }
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  return { codes, calls, fetchFn: fetchFn as unknown as typeof fetch };
}

describe('копия прогресса', () => {
  it('складывается: от каждого уровня и этажа берётся большее', () => {
    saveLevelStars(1, 3);
    saveLevelStars(2, 1);
    saveLevelSpending(1, 2);
    mergeProgress({
      stars: { 2: 3, 11: 2 },
      spent: { 2: 1 },
      levelSpent: { 1: 1, 2: 1 },
    });
    expect(loadLevelStars()).toEqual({ 1: 3, 2: 3, 11: 2 });
    expect(exportProgress().levelSpent).toEqual({ 1: 2, 2: 1 });
    expect(exportProgress().spent).toEqual({ 2: 1 });
    expect(floorWallet(1)).toBe(3);
  });

  it.each([
    ['не объект', 'звёзды'],
    ['нет потраченного', { stars: {} }],
    ['слишком много звёзд за уровень', { stars: { 1: 4 }, spent: {} }],
    ['дробные звёзды', { stars: { 1: 1.5 }, spent: {} }],
    ['неверный номер уровня', { stars: { abc: 1 }, spent: {} }],
    ['слишком много потрачено', { stars: {}, spent: { 1: 1000 } }],
    ['слишком много потрачено на уровне', { stars: {}, spent: {}, levelSpent: { 1: 1000 } }],
  ])('отклоняет: %s', (_, value) => {
    expect(parseProgress(value)).toBeNull();
  });

  it('принимает правильную копию', () => {
    const copy = { stars: { 1: 3 }, spent: { 1: 2 }, levelSpent: { 1: 2 } };
    expect(parseProgress(copy)).toEqual(copy);
  });

  it('копия, сохранённая раньше, без трат по уровням тоже принимается', () => {
    expect(parseProgress({ stars: { 1: 3 }, spent: {} })).toEqual({
      stars: { 1: 3 },
      spent: {},
      levelSpent: {},
    });
  });
});

describe('код переноса', () => {
  it('приводит введённый код к общему виду', () => {
    expect(normalizeCode(' ab12-cd34 ')).toBe('AB12CD34');
  });

  it('первое сохранение получает новый код, ключ идёт в адресе', async () => {
    saveLevelStars(1, 3);
    const { calls, codes, fetchFn } = fakeServer();
    expect(await saveToCode(config, fetchFn)).toBe('NEWCODE2');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/rest/v1/rpc/save_progress?apikey=public-key');
    expect(codes.get('NEWCODE2')).toEqual({ stars: { 1: 3 }, spent: {}, levelSpent: {} });
  });

  it('повторное сохранение сохраняет код и не затирает прогресс другого устройства', async () => {
    saveLevelStars(1, 1);
    const server = fakeServer();
    await saveToCode(config, server.fetchFn);
    server.codes.set('NEWCODE2', { stars: { 1: 3, 2: 2 }, spent: {} });
    expect(await saveToCode(config, server.fetchFn)).toBe('NEWCODE2');
    expect(server.codes.get('NEWCODE2')).toEqual({
      stars: { 1: 3, 2: 2 },
      spent: {},
      levelSpent: {},
    });
  });

  it('загрузка добавляет прогресс и запоминает код', async () => {
    saveLevelStars(5, 2);
    const { calls, fetchFn } = fakeServer({ ABCD2345: { stars: { 1: 3 }, spent: {} } });
    expect(await loadFromCode(config, 'ABCD2345', fetchFn)).toBe(true);
    expect(loadLevelStars()).toEqual({ 1: 3, 5: 2 });
    await saveToCode(config, fetchFn);
    expect(calls[calls.length - 1]?.body.p_code).toBe('ABCD2345');
  });

  it('неизвестный код ничего не меняет', async () => {
    saveLevelStars(1, 3);
    const { fetchFn } = fakeServer();
    expect(await loadFromCode(config, 'NOPE2345', fetchFn)).toBe(false);
    expect(loadLevelStars()).toEqual({ 1: 3 });
  });

  it('ответ неверного вида в прогресс не попадает', async () => {
    const { fetchFn } = fakeServer({ BAD23456: { stars: { 1: 99 }, spent: {} } });
    expect(await loadFromCode(config, 'BAD23456', fetchFn)).toBe(false);
    expect(loadLevelStars()).toEqual({});
  });
});
