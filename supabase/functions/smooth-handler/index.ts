// src/core/config.ts
var BASE_POINTS_PER_TILE = 10;
var LEVEL2_SCORE_MULTIPLIER = 5;
var LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE = {
  3: 15,
  4: 20,
  5: 25
};
var LEVEL2_BIG_MATCH_POINTS = 3 * BASE_POINTS_PER_TILE * LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE[3];
var MATCH_REWARDS = {
  1: {
    3: { kind: "tiles", level: 2, count: 1 },
    4: { kind: "tiles", level: 2, count: 2 },
    5: { kind: "tiles", level: 3, count: 1 }
  },
  2: {
    3: { kind: "tiles", level: 3, count: 1 },
    4: { kind: "tiles", level: 3, count: 2, lineRocket: true },
    5: { kind: "pieces", type: "megaBomb", count: 1 }
  },
  3: {
    3: { kind: "pieces", type: "megaBomb", count: 1 },
    4: { kind: "pieces", type: "rainbow", count: 1 },
    5: { kind: "pieces", type: "rainbow", count: 2 }
  }
};
var LEVEL3_HIT_MULTIPLIER = 15;
var BOMB_SIZE = 3;
var MEGA_BOMB_SIZE = 5;
var BOMB_BOMB_SIZE = 5;
var MEGA_BOMB_BOMB_SIZE = 7;
var ROCKET_BOMB_WIDTH = 3;
var MEGA_BOMB_ROCKET_WIDTH = 5;
var BONUS_TIERS = [
  { cost: 150, type: "bomb" },
  { cost: 300, type: "rocket" },
  { cost: 500, type: "manipulator" },
  { cost: 750, type: "rainbow" }
];
var MOVE_LIMIT = 35;
var MANIPULATOR_FINALE_POINTS = 250;
var FINALE_MAX_ROUNDS = 50;
var PLAYER_NAME_MAX_LENGTH = 16;
var DEMO_BOARD_ROWS = 10;
var DEMO_BOARD_COLS = 10;
var DIFFICULTIES = [
  { id: "kids", name: "\u0414\u0435\u0442\u0441\u043A\u0438\u0439", colors: 3 },
  { id: "easy", name: "\u041B\u0451\u0433\u043A\u0438\u0439", colors: 4 },
  { id: "medium", name: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439", colors: 5 },
  { id: "hard", name: "\u0421\u043B\u043E\u0436\u043D\u044B\u0439", colors: 6 },
  { id: "hell", name: "\u0410\u0414", colors: 7 }
];

// src/core/board.ts
function getCell(board, pos) {
  return board[pos.row]?.[pos.col];
}
function isTile(cell) {
  return cell != null && cell.kind === "tile";
}
function isPiece(cell) {
  return cell != null && cell.kind === "piece";
}
function sameKind(a, b) {
  return isTile(a) && isTile(b) && a.color === b.color && a.level === b.level;
}
function samePos(a, b) {
  return a.row === b.row && a.col === b.col;
}
function posKey({ row, col }) {
  return `${row},${col}`;
}
function createEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}
function cloneBoard(board) {
  return board.map((row) => row.map((cell) => cell === null ? null : { ...cell }));
}
function setCell(board, { row, col }, cell) {
  const line = board[row];
  if (!line || col < 0 || col >= line.length) throw new Error("\u041A\u043B\u0435\u0442\u043A\u0430 \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u043F\u043E\u043B\u044F");
  line[col] = cell;
}
function hasPieces(board) {
  return board.some((line) => line.some((cell) => isPiece(cell)));
}
function allPositions(board) {
  return board.flatMap(
    (line, row) => line.flatMap((cell, col) => cell?.kind === "hole" ? [] : [{ row, col }])
  );
}

// src/core/bonus.ts
function bonusCost(type) {
  return BONUS_TIERS.find((tier) => tier.type === type).cost;
}
function canBuyBonus(score, type) {
  return score >= bonusCost(type);
}
function buyBonus(score, type) {
  return canBuyBonus(score, type) ? score - bonusCost(type) : null;
}
function bonusPiece(type, rng) {
  if (type === "rocket")
    return { kind: "piece", type, direction: rng.int(2) === 0 ? "row" : "col" };
  return { kind: "piece", type };
}
function placeBonus(board, type, rng) {
  const candidates = allPositions(board).filter((pos2) => {
    const cell = getCell(board, pos2);
    return cell?.kind === "tile" && cell.level === 1;
  });
  if (candidates.length === 0) return null;
  const pos = candidates[rng.int(candidates.length)];
  const piece = bonusPiece(type, rng);
  const next = cloneBoard(board);
  setCell(next, pos, piece);
  return { board: next, pos, piece };
}

// src/core/gameStats.ts
function createGameStats() {
  return {
    level2Created: 0,
    level3Created: 0,
    specialsFromMatches: 0,
    specialsActivated: 0,
    bought: { bomb: 0, rocket: 0, manipulator: 0, rainbow: 0 },
    pointsSpent: 0
  };
}
function recordStep(stats, step) {
  if (step.kind === "clear") {
    stats.specialsActivated += step.pieces;
    return;
  }
  if (step.kind !== "transform") return;
  for (const { cell } of step.placements) {
    if (cell?.kind === "tile" && cell.level === 2) stats.level2Created++;
    if (cell?.kind === "tile" && cell.level === 3) stats.level3Created++;
    if (cell?.kind === "piece") stats.specialsFromMatches++;
  }
}
function recordPurchase(stats, type, cost) {
  stats.bought[type]++;
  stats.pointsSpent += cost;
}

// src/core/match.ts
function findMatches(board) {
  const units = [...findRuns(board), ...findSquares(board)];
  return groupUnits(units).map((group) => classify(board, group));
}
function findRuns(board) {
  const runs = [];
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const scan = (lineCount, lineLength, at) => {
    for (let line = 0; line < lineCount; line++) {
      let start2 = 0;
      for (let i = 1; i <= lineLength; i++) {
        const continues = i < lineLength && sameKind(getCell(board, at(line, start2)), getCell(board, at(line, i)));
        if (continues) continue;
        if (i - start2 >= 3) {
          const cells = [];
          for (let k = start2; k < i; k++) cells.push(at(line, k));
          runs.push({ cells, kind: "run" });
        }
        start2 = i;
      }
    }
  };
  scan(rows, cols, (row, col) => ({ row, col }));
  scan(cols, rows, (col, row) => ({ row, col }));
  return runs;
}
function findSquares(board) {
  const squares = [];
  for (let row = 0; row + 1 < board.length; row++) {
    const cols = board[row]?.length ?? 0;
    for (let col = 0; col + 1 < cols; col++) {
      const cells = [
        { row, col },
        { row, col: col + 1 },
        { row: row + 1, col },
        { row: row + 1, col: col + 1 }
      ];
      const first = getCell(board, cells[0]);
      if (!isTile(first)) continue;
      if (cells.every((pos) => sameKind(first, getCell(board, pos)))) {
        squares.push({ cells, kind: "square" });
      }
    }
  }
  return squares;
}
function groupUnits(units) {
  const parent = units.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const ownerByCell = /* @__PURE__ */ new Map();
  units.forEach((unit, i) => {
    for (const pos of unit.cells) {
      const key = `${pos.row},${pos.col}`;
      const owner = ownerByCell.get(key);
      if (owner === void 0) ownerByCell.set(key, i);
      else parent[find(i)] = find(owner);
    }
  });
  const groups = /* @__PURE__ */ new Map();
  units.forEach((unit, i) => {
    const root = find(i);
    groups.set(root, [...groups.get(root) ?? [], unit]);
  });
  return [...groups.values()];
}
function classify(board, units) {
  const cells = uniqueCells(units.flatMap((unit) => unit.cells));
  const tile = getCell(board, cells[0]);
  if (!isTile(tile)) throw new Error("\u0413\u0440\u0443\u043F\u043F\u0430 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u0431\u0435\u0437 \u0444\u0438\u0448\u043A\u0438");
  if (tile.level !== 1) {
    const size = Math.min(cells.length, 5);
    return { level: tile.level, color: tile.color, cells, size };
  }
  return { level: 1, color: tile.color, cells, shape: level1Shape(units, cells.length) };
}
function level1Shape(units, cellCount) {
  if (units.some((unit) => unit.kind === "square")) return "square";
  if (units.length === 1) {
    const length = units[0].cells.length;
    if (length === 3) return "line3";
    if (length === 4) return "line4";
    return "line5";
  }
  return cellCount === 5 ? "lt" : "line5";
}
function uniqueCells(cells) {
  const seen = /* @__PURE__ */ new Set();
  return cells.filter((pos) => {
    const key = `${pos.row},${pos.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// src/core/specials.ts
function squareArea(board, center, size) {
  const half = Math.floor(size / 2);
  return allPositions(board).filter(
    (p) => Math.abs(p.row - center.row) <= half && Math.abs(p.col - center.col) <= half
  );
}
function bandArea(board, center, width, bands) {
  const half = Math.floor(width / 2);
  return allPositions(board).filter(
    (p) => bands.rows && Math.abs(p.row - center.row) <= half || bands.cols && Math.abs(p.col - center.col) <= half
  );
}
function tilesOfColor(board, color, onlyLevel1 = false) {
  return allPositions(board).filter((p) => {
    const cell = getCell(board, p);
    return isTile(cell) && cell.color === color && (!onlyLevel1 || cell.level === 1);
  });
}
function mostFrequentColor(board) {
  const counts = /* @__PURE__ */ new Map();
  for (const cell of board.flat()) {
    if (isTile(cell)) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
  }
  let best = null;
  for (const [color, count] of counts) {
    if (best === null || count > counts.get(best) || count === counts.get(best) && color < best) {
      best = color;
    }
  }
  return best;
}
function activationArea(board, pos, cell) {
  if (!isPiece(cell)) return [];
  switch (cell.type) {
    case "rocket": {
      const rows = cell.direction === "row";
      return bandArea(board, pos, 1, { rows, cols: !rows });
    }
    case "bomb":
      return squareArea(board, pos, BOMB_SIZE);
    case "megaBomb":
      return squareArea(board, pos, MEGA_BOMB_SIZE);
    case "rainbow": {
      const color = mostFrequentColor(board);
      return color === null ? [] : tilesOfColor(board, color);
    }
    case "manipulator":
      return [];
  }
}
function expandChain(board, initial, preActivated = /* @__PURE__ */ new Set()) {
  const destroyed = /* @__PURE__ */ new Map();
  const queue = [...initial];
  while (queue.length > 0) {
    const pos = queue.shift();
    const key = posKey(pos);
    if (destroyed.has(key)) continue;
    const cell = getCell(board, pos);
    if (cell == null || cell.kind === "hole") continue;
    destroyed.set(key, pos);
    if (!preActivated.has(key)) queue.push(...activationArea(board, pos, cell));
  }
  return [...destroyed.values()];
}
function hitPoints(cell) {
  if (!isTile(cell)) return 0;
  if (cell.level === 2) return BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER;
  if (cell.level === 3) return BASE_POINTS_PER_TILE * LEVEL3_HIT_MULTIPLIER;
  return BASE_POINTS_PER_TILE;
}
function comboKind(cell) {
  return isPiece(cell) && cell.type !== "manipulator" ? cell.type : null;
}
function isCombo(board, a, b) {
  return comboKind(getCell(board, a)) !== null && comboKind(getCell(board, b)) !== null;
}
function firesOnSwap(cell) {
  return isPiece(cell) && (cell.type === "rocket" || cell.type === "bomb" || cell.type === "megaBomb");
}
function activationSwapTarget(board, a, b) {
  if (isCombo(board, a, b)) return null;
  const cellA = getCell(board, a);
  const cellB = getCell(board, b);
  if (cellA == null || cellB == null || cellA.kind === "hole" || cellB.kind === "hole") return null;
  if (firesOnSwap(cellA)) return b;
  if (firesOnSwap(cellB)) return a;
  return null;
}
function comboNeedsColor(board, a, b) {
  const kinds = [comboKind(getCell(board, a)), comboKind(getCell(board, b))];
  return kinds.includes("megaBomb") && kinds.includes("rainbow");
}
function comboEffect(board, center, other, rng, color) {
  const cellA = getCell(board, center);
  const cellB = getCell(board, other);
  const kinds = [comboKind(cellA), comboKind(cellB)].sort().join("+");
  const preActivated = /* @__PURE__ */ new Set([posKey(center), posKey(other)]);
  const base = [center, other];
  const effect = (initial, conversions = []) => ({
    conversions,
    initial: [...base, ...initial],
    preActivated
  });
  switch (kinds) {
    case "rocket+rocket":
      return effect(bandArea(board, center, 1, { rows: true, cols: true }));
    case "bomb+rocket":
      return effect(bandArea(board, center, ROCKET_BOMB_WIDTH, { rows: true, cols: true }));
    case "bomb+bomb":
      return effect(squareArea(board, center, BOMB_BOMB_SIZE));
    case "rainbow+rainbow":
    case "megaBomb+megaBomb":
      return effect(allPositions(board));
    case "megaBomb+rocket":
      return effect(bandArea(board, center, MEGA_BOMB_ROCKET_WIDTH, { rows: true, cols: true }));
    case "bomb+megaBomb":
      return effect(squareArea(board, center, MEGA_BOMB_BOMB_SIZE));
    case "rainbow+rocket":
    case "bomb+rainbow": {
      const target = mostFrequentColor(board);
      if (target === null) return effect([]);
      return convertColor(board, target, kinds === "bomb+rainbow" ? "bomb" : "rocket", rng, effect);
    }
    case "megaBomb+rainbow": {
      if (color === void 0) throw new Error("\u0414\u043B\u044F \u043A\u043E\u043C\u0431\u043E \u043C\u0435\u0433\u0430-\u0431\u043E\u043C\u0431\u0430 + \u0440\u0430\u0434\u0443\u0433\u0430 \u043D\u0443\u0436\u0435\u043D \u0446\u0432\u0435\u0442");
      return convertColor(board, color, "bomb", rng, effect);
    }
  }
  throw new Error(`\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u043A\u043E\u043C\u0431\u043E: ${kinds}`);
}
function convertColor(board, color, into, rng, effect) {
  const targets = tilesOfColor(board, color, true);
  const conversions = targets.map((pos) => ({
    pos,
    cell: into === "bomb" ? { kind: "piece", type: "bomb" } : { kind: "piece", type: "rocket", direction: rng.int(2) === 0 ? "row" : "col" }
  }));
  return effect(targets, conversions);
}

// src/core/moves.ts
function areAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}
function swapCells(board, a, b) {
  const next = cloneBoard(board);
  const rowA = next[a.row];
  const rowB = next[b.row];
  if (!rowA || !rowB || a.col >= rowA.length || b.col >= rowB.length) {
    throw new Error("\u041E\u0431\u043C\u0435\u043D \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u043F\u043E\u043B\u044F");
  }
  [rowA[a.col], rowB[b.col]] = [rowB[b.col], rowA[a.col]];
  return next;
}
function isValidSwap(board, a, b) {
  if (!areAdjacent(a, b)) return false;
  if (isCombo(board, a, b) || activationSwapTarget(board, a, b) !== null) return true;
  if (!isMovable(getCell(board, a)) || !isMovable(getCell(board, b))) return false;
  if (!isTile(getCell(board, a)) && !isTile(getCell(board, b))) return false;
  return findMatches(swapCells(board, a, b)).length > 0;
}
function isMovable(cell) {
  return isTile(cell) || isPiece(cell) && cell.type === "manipulator";
}
function findPossibleMoves(board) {
  const moves = [];
  board.forEach(
    (row, r) => row.forEach((_, c) => {
      const from = { row: r, col: c };
      for (const to of [
        { row: r, col: c + 1 },
        { row: r + 1, col: c }
      ]) {
        if (isValidSwap(board, from, to)) moves.push({ from, to });
      }
    })
  );
  return moves;
}
function hasPossibleMove(board) {
  return findPossibleMoves(board).length > 0;
}
function hasTileMove(board) {
  return findPossibleMoves(board).some(
    ({ from, to }) => isTile(getCell(board, from)) && isTile(getCell(board, to))
  );
}
var SHUFFLE_ATTEMPTS = 100;
var RECOLOR_ATTEMPTS = 500;
function shuffleBoard(board, colorCount, rng) {
  const positions = allPositions(board).filter((pos) => getCell(board, pos) !== null);
  const cells = positions.map((pos) => getCell(board, pos));
  let candidate = board;
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    candidate = cloneBoard(board);
    const order = shuffled(cells, rng);
    positions.forEach((pos, i) => setCell(candidate, pos, { ...order[i] }));
    if (findMatches(candidate).length === 0 && hasTileMove(candidate)) return candidate;
  }
  const result = findMatches(candidate).length === 0 ? candidate : cloneBoard(board);
  const level1 = positions.filter((pos) => {
    const cell = getCell(result, pos);
    return cell?.kind === "tile" && cell.level === 1;
  });
  for (let i = 0; i < RECOLOR_ATTEMPTS && level1.length > 0 && !hasTileMove(result); i++) {
    const pos = level1[rng.int(level1.length)];
    const before = getCell(result, pos);
    setCell(result, pos, { kind: "tile", color: rng.int(colorCount), level: 1 });
    if (findMatches(result).length > 0) setCell(result, pos, before);
  }
  return result;
}
function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// src/core/generate.ts
var MAX_ATTEMPTS = 100;
function generateStartBoard(template, colorCount, rng) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board = fillOnce(template, colorCount, rng);
    if (findMatches(board).length === 0 && hasPossibleMove(board)) return board;
  }
  throw new Error(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u0435 \u0437\u0430 ${MAX_ATTEMPTS} \u043F\u043E\u043F\u044B\u0442\u043E\u043A`);
}
function fillOnce(template, colorCount, rng) {
  const board = cloneBoard(template);
  board.forEach(
    (row, r) => row.forEach((cell, c) => {
      if (cell !== null) return;
      const pos = { row: r, col: c };
      const allowed = range(colorCount).filter((color) => !wouldMatch(board, pos, color));
      const pool = allowed.length > 0 ? allowed : range(colorCount);
      row[c] = { kind: "tile", color: pool[rng.int(pool.length)], level: 1 };
    })
  );
  return board;
}
function wouldMatch(board, { row, col }, color) {
  const is = (r, c) => {
    const cell = getCell(board, { row: r, col: c });
    return cell?.kind === "tile" && cell.level === 1 && cell.color === color;
  };
  return is(row, col - 1) && is(row, col - 2) || is(row - 1, col) && is(row - 2, col) || is(row, col - 1) && is(row - 1, col) && is(row - 1, col - 1);
}
function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

// src/core/gravity.ts
function removeCells(board, cells) {
  const next = cloneBoard(board);
  for (const { row, col } of cells) {
    const kind = next[row]?.[col]?.kind;
    if (kind === "tile" || kind === "piece") next[row][col] = null;
  }
  return next;
}
function applyGravity(board) {
  const next = cloneBoard(board);
  const falls = [];
  const cols = next[0]?.length ?? 0;
  for (let col = 0; col < cols; col++) {
    const slots = [];
    for (let row = next.length - 1; row >= 0; row--) {
      if (next[row]?.[col]?.kind !== "hole") slots.push(row);
    }
    let target = 0;
    for (const row of slots) {
      const cell = next[row][col];
      if (cell === null) continue;
      const toRow = slots[target++];
      if (toRow !== row) {
        next[toRow][col] = cell;
        next[row][col] = null;
        falls.push({ from: { row, col }, to: { row: toRow, col } });
      }
    }
  }
  return { board: next, falls };
}
function refill(board, colorCount, rng) {
  const next = cloneBoard(board);
  const spawns = [];
  next.forEach(
    (row, r) => row.forEach((cell, c) => {
      if (cell !== null) return;
      const tile = { kind: "tile", color: rng.int(colorCount), level: 1 };
      row[c] = tile;
      spawns.push({ to: { row: r, col: c }, tile });
    })
  );
  return { board: next, spawns };
}

// src/core/resolve.ts
var MAX_WAVES = 1e3;
function* resolveMove(board, move, ctx) {
  let current = board;
  let score = 0;
  let landing = [];
  function* destroy(initial, preActivated, pointsOverride) {
    const cells = expandChain(current, initial, preActivated);
    if (cells.length === 0) return;
    const points = cells.reduce(
      (sum, pos) => sum + (pointsOverride?.get(posKey(pos)) ?? hitPoints(getCell(current, pos))),
      0
    );
    const pieces = cells.filter((pos) => isPiece(getCell(current, pos))).length;
    score += points;
    current = removeCells(current, cells);
    yield { kind: "clear", cells, points, pieces };
  }
  function* place(placements) {
    if (placements.length === 0) return;
    current = cloneBoard(current);
    for (const { pos, cell } of placements) setCell(current, pos, cell);
    yield { kind: "transform", placements };
  }
  switch (move.type) {
    case "swap": {
      const combo = isCombo(current, move.from, move.to);
      const fireAt = activationSwapTarget(current, move.from, move.to);
      current = swapCells(current, move.from, move.to);
      yield { kind: "swap", a: move.from, b: move.to };
      if (combo) {
        const effect = comboEffect(current, move.to, move.from, ctx.rng, move.color);
        yield* place(effect.conversions);
        yield* destroy(effect.initial, effect.preActivated);
      } else if (fireAt) {
        yield* destroy([fireAt]);
      } else {
        landing = [move.to, move.from];
      }
      break;
    }
    case "rainbow": {
      const initial = [move.at, ...tilesOfColor(current, move.color)];
      yield* destroy(initial, /* @__PURE__ */ new Set([posKey(move.at)]));
      break;
    }
    case "megaBomb": {
      yield* destroy(squareArea(current, move.at, MEGA_BOMB_SIZE), /* @__PURE__ */ new Set([posKey(move.at)]));
      break;
    }
    case "manipulator": {
      current = removeCells(current, [move.at]);
      yield { kind: "clear", cells: [move.at], points: 0, pieces: 1 };
      current = swapCells(current, move.a, move.b);
      yield { kind: "swap", a: move.a, b: move.b };
      landing = [move.b, move.a];
      break;
    }
    case "finale": {
      yield* destroy(...finaleBlast(current, ctx.rng));
      break;
    }
  }
  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const groups = findMatches(current);
    if (groups.length === 0) {
      if (!hasEmpty(current)) return { board: current, score };
    } else {
      const removal = [];
      const placements = [];
      const points = /* @__PURE__ */ new Map();
      for (const group of groups) {
        const outcome = groupOutcome(group, pickSpot(group, landing));
        removal.push(...group.cells);
        spreadPoints(group.cells, outcome.points, points);
        placements.push(...outcome.placements);
      }
      yield* destroy(removal, void 0, points);
      yield* place(placements);
    }
    landing = [];
    const fallen = applyGravity(current);
    const filled = refill(fallen.board, ctx.colorCount, ctx.rng);
    current = filled.board;
    yield { kind: "drop", falls: fallen.falls, spawns: filled.spawns };
  }
  throw new Error(`\u041A\u0430\u0441\u043A\u0430\u0434 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u0437\u0430 ${MAX_WAVES} \u0432\u043E\u043B\u043D`);
}
function hasEmpty(board) {
  return board.some((line) => line.includes(null));
}
function groupOutcome(group, spot) {
  const size = Math.min(group.cells.length, 5);
  const reward = MATCH_REWARDS[group.level][size];
  const cells = reward.count === 2 ? [spot, neighborInGroup(group, spot, [spot])] : [spot];
  const cell = reward.kind === "tiles" ? { kind: "tile", color: group.color, level: reward.level } : { kind: "piece", type: reward.type };
  const placements = cells.map((pos) => ({ pos, cell }));
  const direction = lineDirection(group);
  if (reward.kind === "tiles" && reward.lineRocket && direction) {
    const pos = neighborInGroup(group, spot, cells);
    placements.push({ pos, cell: { kind: "piece", type: "rocket", direction } });
  }
  return { points: matchPoints(group.level, group.cells.length), placements };
}
function matchPoints(level, cells) {
  const size = Math.min(cells, 5);
  if (level === 1) return cells * BASE_POINTS_PER_TILE;
  if (level === 2) {
    return size === 5 ? LEVEL2_BIG_MATCH_POINTS : cells * BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER;
  }
  return cells * BASE_POINTS_PER_TILE * LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE[size];
}
function spreadPoints(cells, total, into) {
  const share = Math.floor(total / cells.length);
  cells.forEach((pos, i) => {
    into.set(posKey(pos), share + (i === 0 ? total - share * cells.length : 0));
  });
}
function finaleBlast(board, rng) {
  const initial = [];
  const preActivated = /* @__PURE__ */ new Set();
  const points = /* @__PURE__ */ new Map();
  const colors = [...new Set(board.flat().flatMap((cell) => isTile(cell) ? [cell.color] : []))];
  for (const pos of allPositions(board)) {
    const cell = getCell(board, pos);
    if (cell?.kind !== "piece") continue;
    initial.push(pos);
    if (cell.type === "rainbow") {
      preActivated.add(posKey(pos));
      const color = colors[rng.int(colors.length)];
      if (color !== void 0) initial.push(...tilesOfColor(board, color));
    } else if (cell.type === "manipulator") {
      preActivated.add(posKey(pos));
      points.set(posKey(pos), MANIPULATOR_FINALE_POINTS);
    }
  }
  return [initial, preActivated, points];
}
function pickSpot(group, landing) {
  const landed = landing.find((pos) => group.cells.some((c) => samePos(c, pos)));
  if (landed) return landed;
  const sorted = [...group.cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const sameRow = sorted.every((p) => p.row === sorted[0].row);
  const sameCol = sorted.every((p) => p.col === sorted[0].col);
  if (sameRow || sameCol) return sorted[Math.floor((sorted.length - 1) / 2)];
  const has = (row, col) => sorted.some((p) => p.row === row && p.col === col);
  const crossing = sorted.find(
    (p) => (has(p.row, p.col - 1) || has(p.row, p.col + 1)) && (has(p.row - 1, p.col) || has(p.row + 1, p.col))
  );
  return crossing ?? sorted[0];
}
function lineDirection(group) {
  const [first] = group.cells;
  if (group.cells.every((p) => p.row === first.row)) return "row";
  if (group.cells.every((p) => p.col === first.col)) return "col";
  return null;
}
function neighborInGroup(group, spot, taken) {
  const free = (pos) => group.cells.some((c) => samePos(c, pos)) && !taken.some((t) => samePos(t, pos));
  const offsets = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0]
  ];
  for (const [dr, dc] of offsets) {
    const pos = { row: spot.row + dr, col: spot.col + dc };
    if (free(pos)) return pos;
  }
  return group.cells.find(free);
}

// src/core/rng.ts
function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = state + 1831565813 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    getState: () => state
  };
}

// src/core/session.ts
var GameSession = class {
  constructor(seed, colorCount) {
    this.colorCount = colorCount;
    this.rng = createRng(seed);
    this.board = generateStartBoard(
      createEmptyBoard(DEMO_BOARD_ROWS, DEMO_BOARD_COLS),
      colorCount,
      this.rng
    );
  }
  colorCount;
  board;
  score = 0;
  /** Сколько ходов сделано (покупка спецфишки и перемешивание не считаются) */
  moves = 0;
  shuffles = 0;
  stats = createGameStats();
  actions = [];
  rng;
  get isOver() {
    return this.moves >= MOVE_LIMIT;
  }
  /** Ход игрока; шаги отдаются для анимации */
  play(move) {
    this.moves++;
    this.actions.push(move);
    return this.run(move);
  }
  *run(move) {
    const steps = resolveMove(this.board, move, { colorCount: this.colorCount, rng: this.rng });
    let next = steps.next();
    while (!next.done) {
      const step = next.value;
      recordStep(this.stats, step);
      if (step.kind === "clear") this.score += step.points;
      next = steps.next(yield step);
    }
    this.board = next.value.board;
  }
  /** Покупка спецфишки; null — если не хватает очков или некуда поставить */
  buy(type) {
    const scoreAfter = buyBonus(this.score, type);
    if (scoreAfter === null) return null;
    const placed = placeBonus(this.board, type, this.rng);
    if (!placed) return null;
    recordPurchase(this.stats, type, this.score - scoreAfter);
    this.score = scoreAfter;
    this.board = placed.board;
    this.actions.push({ type: "buy", bonus: type });
    return { pos: placed.pos, piece: placed.piece };
  }
  /** Если ходов обычными фишками не осталось — перемешивает поле. true — перемешали */
  shuffleIfStuck() {
    if (hasTileMove(this.board)) return false;
    this.shuffles++;
    this.board = shuffleBoard(this.board, this.colorCount, this.rng);
    return true;
  }
  /** Финал: спецфишки срабатывают, пока на поле не останется ни одной (в каскадах бывают новые) */
  *finale() {
    for (let round = 0; round < FINALE_MAX_ROUNDS && hasPieces(this.board); round++) {
      yield* this.run({ type: "finale" });
    }
  }
  /** Может ли игрок сделать это в текущем состоянии — журнал приходит от клиента, ему не верим */
  canApply(action) {
    const { board } = this;
    const piece = (pos, type) => {
      const cell = getCell(board, pos);
      return isPiece(cell) && cell.type === type;
    };
    switch (action.type) {
      case "buy":
        return true;
      // проверяет сама покупка
      case "swap":
        return isFilled(board, action.from) && isFilled(board, action.to) && isValidSwap(board, action.from, action.to) && (comboNeedsColor(board, action.from, action.to) ? hasColor(board, action.color) : action.color === void 0);
      case "rainbow":
        return piece(action.at, "rainbow") && hasColor(board, action.color);
      case "megaBomb":
        return piece(action.at, "megaBomb");
      case "manipulator":
        return piece(action.at, "manipulator") && isFilled(board, action.a) && isFilled(board, action.b) && !samePos(action.a, action.b) && !samePos(action.a, action.at) && !samePos(action.b, action.at);
    }
  }
};
function isFilled(board, pos) {
  const cell = getCell(board, pos);
  return cell != null && cell.kind !== "hole";
}
function hasColor(board, color) {
  return allPositions(board).some((pos) => {
    const cell = getCell(board, pos);
    return isTile(cell) && cell.color === color;
  });
}
function finish(steps) {
  let next = steps.next();
  while (!next.done) next = steps.next();
}
function replayGame(seed, colorCount, actions) {
  const session = new GameSession(seed, colorCount);
  for (const action of actions) {
    if (session.isOver || !session.canApply(action)) return null;
    if (action.type === "buy") {
      if (!session.buy(action.bonus)) return null;
    } else {
      finish(session.play(action));
    }
    session.shuffleIfStuck();
  }
  if (!session.isOver) return null;
  finish(session.finale());
  return session.score;
}
var MAX_ACTIONS = 1e3;
var isInt = (value) => Number.isInteger(value);
function parsePosition(value) {
  if (typeof value !== "object" || value === null) return null;
  const { row, col } = value;
  return isInt(row) && isInt(col) ? { row, col } : null;
}
function parseAction(value) {
  if (typeof value !== "object" || value === null) return null;
  const v = value;
  switch (v.type) {
    case "buy": {
      const tier = BONUS_TIERS.find((t) => t.type === v.bonus);
      return tier ? { type: "buy", bonus: tier.type } : null;
    }
    case "swap": {
      const from = parsePosition(v.from);
      const to = parsePosition(v.to);
      if (!from || !to) return null;
      if (v.color === void 0) return { type: "swap", from, to };
      return isInt(v.color) ? { type: "swap", from, to, color: v.color } : null;
    }
    case "rainbow": {
      const at = parsePosition(v.at);
      return at && isInt(v.color) ? { type: "rainbow", at, color: v.color } : null;
    }
    case "megaBomb": {
      const at = parsePosition(v.at);
      return at ? { type: "megaBomb", at } : null;
    }
    case "manipulator": {
      const at = parsePosition(v.at);
      const a = parsePosition(v.a);
      const b = parsePosition(v.b);
      return at && a && b ? { type: "manipulator", at, a, b } : null;
    }
    default:
      return null;
  }
}
function parseActions(value) {
  if (!Array.isArray(value) || value.length > MAX_ACTIONS) return null;
  const actions = value.map(parseAction);
  return actions.every((action) => action !== null) ? actions : null;
}

// src/storage/leaderboard.ts
var DEFAULT_PLAYER_NAME = "\u0418\u0433\u0440\u043E\u043A";
function normalizeName(name) {
  const trimmed = name.trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_NAME;
}

// src/server/gameServer.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
});
async function rpc(env, name, args, fetchFn) {
  const bearer = env.key.startsWith("eyJ") ? { Authorization: `Bearer ${env.key}` } : void 0;
  const response = await fetchFn(`${env.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.key, "Content-Type": "application/json", ...bearer },
    body: JSON.stringify(args)
  });
  if (!response.ok) throw new Error(`\u0411\u0430\u0437\u0430 \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0430 ${response.status} \u043D\u0430 ${name}`);
  return response.json();
}
function clientIp(request) {
  const { headers } = request;
  return headers.get("cf-connecting-ip") || headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
async function start(request, body, env, fetchFn) {
  const difficulty = DIFFICULTIES.find((d) => d.id === body.difficulty);
  if (!difficulty) return json({ error: "difficulty" }, 400);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const id = await rpc(
    env,
    "start_game_session",
    { p_ip: clientIp(request), p_difficulty: difficulty.id, p_seed: seed },
    fetchFn
  );
  return typeof id === "string" ? json({ id, seed }) : json({ error: "limit" }, 429);
}
async function finish2(request, body, env, fetchFn) {
  const actions = parseActions(body.actions);
  if (!actions || typeof body.id !== "string" || !SESSION_ID.test(body.id)) {
    return json({ reason: "invalid" });
  }
  const claimed = await rpc(env, "claim_game_session", { p_id: body.id }, fetchFn);
  const session = Array.isArray(claimed) ? claimed[0] : void 0;
  const difficulty = DIFFICULTIES.find((d) => d.id === session?.difficulty);
  if (!session || !difficulty) return json({ reason: "invalid" });
  const score = replayGame(session.seed, difficulty.colors, actions);
  if (score === null) {
    console.warn(`\u0416\u0443\u0440\u043D\u0430\u043B \u043F\u0430\u0440\u0442\u0438\u0438 ${body.id} \u043D\u0435 \u043F\u0440\u043E\u0448\u0451\u043B \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443`);
    return json({ reason: "invalid" });
  }
  const name = normalizeName(typeof body.name === "string" ? body.name : "");
  const entryId = await rpc(
    env,
    "submit_verified_result",
    { p_ip: clientIp(request), p_difficulty: difficulty.id, p_name: name, p_score: score },
    fetchFn
  );
  return typeof entryId === "number" ? json({ entryId, score }) : json({ reason: "limit", score });
}
async function handleGameRequest(request, env, fetchFn = fetch) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  try {
    const body = await request.json();
    if (body.action === "start") return await start(request, body, env, fetchFn);
    if (body.action === "finish") return await finish2(request, body, env, fetchFn);
    return json({ error: "action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "server" }, 500);
  }
}

// src/server/entry.ts
function secretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const named = keys ? JSON.parse(keys).default : void 0;
  return named ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
Deno.serve(
  (request) => handleGameRequest(request, {
    url: Deno.env.get("SUPABASE_URL") ?? "",
    key: secretKey()
  })
);
