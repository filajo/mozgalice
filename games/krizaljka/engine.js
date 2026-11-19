// Daily crossword generator: deterministically builds a crossword grid from the word bank,
// seeded by date so every player gets the same puzzle on the same day.
(function (global) {
  // Seedable RNG (mulberry32), same approach as the sudoku engine.
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
  function shuffle(a, rand) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const normLetter = ch => ({ Č: 'C', Ć: 'C', Š: 'S', Ž: 'Z', Đ: 'D' }[ch] || ch);
  const normalize = s => [...String(s).toUpperCase()].map(normLetter).join('');

  const key = (r, c) => r + ',' + c;

  function build(words, rand, opts) {
    const maxSize = (opts && opts.maxSize) || 15;
    const targetWords = (opts && opts.targetWords) || 18;
    const candidatePool = (opts && opts.candidatePool) || 90;

    // Shuffle for variety, then stable-sort longest first (helps the grid interlock well).
    let pool = shuffle(words, rand).slice(0, candidatePool);
    pool = pool.map((w, i) => ({ ...w, _i: i })).sort((a, b) => b.answer.length - a.answer.length || a._i - b._i);

    const grid = new Map();       // "r,c" -> letter
    const cellDirs = new Map();   // "r,c" -> Set of 'across'|'down'
    const placed = [];            // { answer, clue, row, col, dir }
    let minR = 0, maxR = 0, minC = 0, maxC = 0;

    function canPlace(answer, row, col, dir) {
      const len = answer.length;
      const endR = dir === 'across' ? row : row + len - 1;
      const endC = dir === 'across' ? col + len - 1 : col;
      const nr = Math.max(maxR, endR) - Math.min(minR, row) + 1;
      const nc = Math.max(maxC, endC) - Math.min(minC, col) + 1;
      if (nr > maxSize || nc > maxSize) return false;

      const before = dir === 'across' ? key(row, col - 1) : key(row - 1, col);
      const after = dir === 'across' ? key(row, col + len) : key(row + len, col);
      if (grid.has(before) || grid.has(after)) return false;

      let crossCount = 0;
      for (let i = 0; i < len; i++) {
        const r = dir === 'across' ? row : row + i;
        const c = dir === 'across' ? col + i : col;
        const k = key(r, c);
        if (grid.has(k)) {
          if (grid.get(k) !== answer[i]) return false;
          const dirs = cellDirs.get(k);
          if (dirs.has(dir)) return false; // would overlap a word running the same way
          crossCount++;
        } else {
          // empty cell: neighbours perpendicular to this word must also be empty,
          // so this word doesn't accidentally touch another one.
          if (dir === 'across') {
            if (grid.has(key(r - 1, c)) || grid.has(key(r + 1, c))) return false;
          } else {
            if (grid.has(key(r, c - 1)) || grid.has(key(r, c + 1))) return false;
          }
        }
      }
      return crossCount > 0 || placed.length === 0;
    }

    function commit(answer, clue, row, col, dir) {
      const len = answer.length;
      for (let i = 0; i < len; i++) {
        const r = dir === 'across' ? row : row + i;
        const c = dir === 'across' ? col + i : col;
        const k = key(r, c);
        grid.set(k, answer[i]);
        if (!cellDirs.has(k)) cellDirs.set(k, new Set());
        cellDirs.get(k).add(dir);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
      placed.push({ answer, clue, row, col, dir });
    }

    // First word: horizontal, anchored at the origin.
    const first = pool[0];
    commit(first.answer, first.clue, 0, 0, 'across');

    for (let idx = 1; idx < pool.length && placed.length < targetWords; idx++) {
      const w = pool[idx];
      if (placed.some(p => p.answer === w.answer)) continue;
      const letters = shuffle(Array.from({ length: w.answer.length }, (_, i) => i), rand);
      let done = false;
      for (const i of letters) {
        if (done) break;
        const ch = w.answer[i];
        const cells = shuffle([...grid.keys()].filter(k => grid.get(k) === ch), rand);
        for (const k of cells) {
          const [r, c] = k.split(',').map(Number);
          for (const dir of shuffle(['across', 'down'], rand)) {
            const row = dir === 'across' ? r : r - i;
            const col = dir === 'across' ? c - i : c;
            if (canPlace(w.answer, row, col, dir)) {
              commit(w.answer, w.clue, row, col, dir);
              done = true;
              break;
            }
          }
          if (done) break;
        }
      }
    }

    // Normalize coordinates to start at (0,0).
    for (const p of placed) { p.row -= minR; p.col -= minC; }
    const rows = maxR - minR + 1, cols = maxC - minC + 1;

    // Number cells: scan in reading order, a cell gets a number if a word starts there.
    const starts = new Map(); // "r,c" -> number
    const ordered = placed.slice().sort((a, b) => a.row - b.row || a.col - b.col);
    let n = 1;
    for (const p of ordered) {
      const k = key(p.row, p.col);
      if (!starts.has(k)) starts.set(k, n++);
      p.number = starts.get(k);
    }

    const cells = Array.from({ length: rows }, () => new Array(cols).fill(null));
    for (const p of placed) {
      for (let i = 0; i < p.answer.length; i++) {
        const r = p.dir === 'across' ? p.row : p.row + i;
        const c = p.dir === 'across' ? p.col + i : p.col;
        if (!cells[r][c]) cells[r][c] = { letter: p.answer[i], number: starts.get(key(r, c)) };
      }
    }

    const clues = placed
      .map(p => ({ number: p.number, dir: p.dir, row: p.row, col: p.col, answer: p.answer, clue: p.clue, length: p.answer.length }))
      .sort((a, b) => a.number - b.number || (a.dir === b.dir ? 0 : a.dir === 'across' ? -1 : 1));

    return { rows, cols, cells, clues };
  }

  function generate(words, seed, opts) {
    const rand = seeded(seed);
    let best = null;
    // A few tries (varying the shuffle a little) so an unlucky draw doesn't leave too few words.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = build(words, rand, opts);
      if (!best || result.clues.length > best.clues.length) best = result;
      if (best.clues.length >= ((opts && opts.targetWords) || 18)) break;
    }
    return best;
  }

  global.KrizaljkaEngine = { generate, normalize, normLetter };
})(typeof window !== 'undefined' ? window : globalThis);
