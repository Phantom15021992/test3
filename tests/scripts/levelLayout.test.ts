import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/core/level';
import { LEVELS } from '../../src/levels';
import { lowerCrowns, resizeLevel } from '../../scripts/levelLayout';

const count = (layout: readonly string[], symbols: string) =>
  [...layout.join('')].filter((symbol) => symbols.includes(symbol)).length;

describe('размер целей уровня', () => {
  it('препятствий на поле ровно по цели, остальное поле не меняется', () => {
    for (const level of LEVELS) {
      for (const scale of [0.6, 1.5, 3]) {
        const { layout, goals } = resizeLevel(level.layout, level.goals, scale);
        for (const [kind, symbols] of [
          ['ice', 'i'],
          ['box', 'b'],
          ['chain', '123'],
        ] as const) {
          const goal = goals.find((g) => g.kind === kind)?.count ?? 0;
          expect(count(layout, symbols), `уровень ${level.id}, ${kind}, ×${scale}`).toBe(goal);
        }
        expect(count(layout, '#')).toBe(count(level.layout, '#'));
        expect(count(layout, 'o')).toBe(count(level.layout, 'o'));
        expect(count(layout, 's')).toBe(count(level.layout, 's'));
        expect(() => parseLevel({ ...level, layout, goals })).not.toThrow();
      }
    }
  });

  it('цели растут, цепи — новыми цепями и звеньями, не ближе 3 клеток и по одной в строке', () => {
    const level = LEVELS.find((l) => l.goals.some((g) => g.kind === 'chain'))!;
    const links = (layout: readonly string[]) =>
      [...layout.join('')].filter((s) => '123'.includes(s)).reduce((sum, s) => sum + Number(s), 0);
    const { layout } = resizeLevel(level.layout, level.goals, 3);
    expect(links(layout)).toBeGreaterThan(links(level.layout));
    const chains = layout.flatMap((line, row) =>
      [...line].flatMap((s, col) => ('123'.includes(s) ? [{ row, col }] : [])),
    );
    chains.forEach((a, i) =>
      chains.slice(i + 1).forEach((b) => {
        expect(a.row).not.toBe(b.row);
        expect(Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))).toBeGreaterThanOrEqual(
          3,
        );
      }),
    );
  });

  it('цели из ячеек растут числом, короны не меняются', () => {
    const goals = [
      { kind: 'level2', count: 10 },
      { kind: 'item', count: 1 },
    ] as const;
    expect(resizeLevel(['....', '.o..'], goals, 1.5).goals).toEqual([
      { kind: 'level2', count: 15 },
      { kind: 'item', count: 1 },
    ]);
  });

  it('короны опускаются по своему столбцу сквозь дыры, но не на дно и не на занятую клетку', () => {
    const layout = ['o..o', '....', '#...', '..s.', '....'];
    // Левая корона пролетает дыру во 2-й строке
    expect(lowerCrowns(layout, 2)).toEqual(['....', '....', '#..o', 'o.s.', '....']);
    // Ниже некуда: на дне корона засчиталась бы сразу
    expect(lowerCrowns(layout, 10)).toEqual(['....', '....', '#...', 'o.so', '....']);
    // Под короной камень: она встаёт выше него
    expect(lowerCrowns(['..o.', '..s.', '....'], 1)).toEqual(['..o.', '..s.', '....']);
  });
});
