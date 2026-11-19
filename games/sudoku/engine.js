// Sudoku generator/solver. Grid = array of 81 numbers, 0 = empty.
(function (global) {
  const ROW = i => Math.floor(i / 9), COL = i => i % 9;
  const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
    }
    PEERS.push([...s]);
  }

  // Seedable RNG (mulberry32) so a "daily challenge" gives the same puzzle on every phone.
  let rand = Math.random;
  function seeded(seed) {
    let a = 0;
    for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function candidates(g, i) {
    const used = new Array(10).fill(false);
    for (const p of PEERS[i]) used[g[p]] = true;
    const c = [];
    for (let n = 1; n <= 9; n++) if (!used[n]) c.push(n);
    return c;
  }

  // Count solutions up to `limit`, choosing the most constrained cell first.
  function countSolutions(g, limit = 2) {
    let count = 0;
    const grid = g.slice();
    (function solve() {
      if (count >= limit) return;
      let best = -1, bestC = null;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const c = candidates(grid, i);
        if (c.length === 0) return;
        if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length === 1) break; }
      }
      if (best === -1) { count++; return; }
      for (const n of bestC) {
        grid[best] = n;
        solve();
        if (count >= limit) break;
      }
      grid[best] = 0;
    })();
    return count;
  }

  function solvedGrid() {
    const g = new Array(81).fill(0);
    (function fill(i) {
      if (i === 81) return true;
      for (const n of shuffle(candidates(g, i))) {
        g[i] = n;
        if (fill(i + 1)) return true;
      }
      g[i] = 0;
      return false;
    })(0);
    return g;
  }

  // Target number of givens per level. Fewer givens = harder.
  const LEVELS = {
    easy:   { label: 'Lako',       clues: 40 },
    medium: { label: 'Srednje',    clues: 32 },
    hard:   { label: 'Teško',      clues: 27 },
    expert: { label: 'Stručnjak',  clues: 23 }
  };

  function generate(level, seed) {
    rand = seed == null ? Math.random : seeded(seed);
    try { return generateInner(level); } finally { rand = Math.random; }
  }

  function generateInner(level) {
    const target = (LEVELS[level] || LEVELS.medium).clues;
    let best = null;
    // A few attempts; keep the one with fewest givens (hard targets are not always reachable).
    for (let attempt = 0; attempt < 4; attempt++) {
      const solution = solvedGrid();
      const puzzle = solution.slice();
      let givens = 81;
      // Remove symmetric pairs so the puzzle looks balanced.
      const order = shuffle([...Array(41).keys()]);
      for (const i of order) {
        if (givens <= target) break;
        const j = 80 - i;
        const a = puzzle[i], b = puzzle[j];
        const removed = i === j ? 1 : 2;
        if (givens - removed < target - 1) continue;
        puzzle[i] = 0; puzzle[j] = 0;
        if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = b; }
        else givens -= removed;
      }
      if (!best || givens < best.givens) best = { puzzle, solution, givens };
      if (givens <= target) break;
    }
    return best;
  }

  global.SudokuEngine = { generate, countSolutions, LEVELS, PEERS, ROW, COL, BOX };
})(typeof window !== 'undefined' ? window : globalThis);
