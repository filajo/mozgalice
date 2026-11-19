(function () {
  const E = window.KrizaljkaEngine;
  const WORDS = window.KRIZALJKA_WORDS;
  const STATE_KEY = 'krizaljka.state';
  const GRID_OPTS = { maxSize: 15, targetWords: 18, candidatePool: 90 };
  const BASE_POINTS = 60, PENALTY_HINT_SECONDS = 20, HINT_POINT_COST = 3, CLEAN_BONUS = 10;

  const $ = id => document.getElementById(id);
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDay = d => { const [y, m, dd] = d.split('-'); return `${+dd}.${+m}.${y}.`; };
  function weekDays() {
    const d = new Date(); const offset = (d.getDay() + 6) % 7;
    const monday = new Date(d); monday.setDate(d.getDate() - offset);
    return [...Array(7).keys()].map(i => { const x = new Date(monday); x.setDate(monday.getDate() + i); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  }

  function pointsFor(entry) {
    let p = BASE_POINTS - entry.hints * HINT_POINT_COST;
    if (entry.hints === 0) p += CLEAN_BONUS;
    return Math.max(Math.round(BASE_POINTS * 0.3), p);
  }

  let S = null;        // current game state
  let dir = 'across';
  let selected = null; // {r,c}
  let tick = null;
  const cellEls = [];  // 2D array of button elements

  // ---------- persistence ----------
  const saveState = () => { if (S) localStorage.setItem(STATE_KEY, JSON.stringify({ ...S, values: S.values })); };
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; } };
  const dailyDoneKey = day => `krizaljka.daily.${day}`;

  // ---------- screens ----------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    if (id !== 'game') { stopTimer(); $('hidden-input').blur(); }
    window.scrollTo(0, 0);
  }

  function ensurePlayer() {
    const v = $('player').value.trim();
    if (v) { Scores.setPlayer(v); return true; }
    $('player').focus();
    $('player').placeholder = 'Upiši ime za ljestvicu';
    $('player').classList.add('need');
    return false;
  }

  function renderMenu() {
    $('player').value = Scores.getPlayer();
    const st = loadState();
    const canContinue = st && !st.won;
    $('btn-continue').hidden = !canContinue;
    if (canContinue) $('continue-info').textContent = `${st.mode === 'daily' ? 'Dnevna križaljka' : 'Vježba'} · ${fmt(st.seconds)}`;

    const d = today();
    const done = JSON.parse(localStorage.getItem(dailyDoneKey(d)) || 'null');
    $('btn-daily').textContent = done ? '✓ Riješeno danas' : (st && !st.won && st.mode === 'daily' && st.day === d ? 'Nastavi' : 'Igraj');
    $('daily-done').hidden = !done;
    if (done) $('daily-done').textContent = `Tvoje vrijeme: ${fmt(done.seconds)} · ${done.hints ? done.hints + ' otkriveno slovo' : 'bez pomoći'}`;
  }

  // ---------- game setup ----------
  async function startDaily() {
    const st = loadState();
    const d = today();
    if (st && !st.won && st.mode === 'daily' && st.day === d) return resume(st);
    if (st && !st.won) {
      const ok = await UI.confirm('Imaš nezavršenu križaljku. Ako započneš novu, ta igra se gubi (ne broji se u statistiku). Nastaviti?');
      if (!ok) return;
    }
    if (!ensurePlayer()) return;
    const grid = E.generate(WORDS, `${d}:krizaljka`, GRID_OPTS);
    beginGame('daily', d, grid);
  }

  async function startFree() {
    const st = loadState();
    if (st && !st.won) {
      const ok = await UI.confirm('Imaš nezavršenu križaljku. Ako započneš novu, ta igra se gubi (ne broji se u statistiku). Nastaviti?');
      if (!ok) return;
    }
    if (!ensurePlayer()) return;
    const seed = 'free:' + Date.now() + ':' + Math.random();
    const grid = E.generate(WORDS, seed, GRID_OPTS);
    beginGame('free', today(), grid);
  }

  function beginGame(mode, day, grid) {
    const values = Array.from({ length: grid.rows }, (_, r) => grid.cells[r].map(c => c ? '' : null));
    const revealed = Array.from({ length: grid.rows }, () => new Array(grid.cols).fill(false));
    S = { mode, day, grid, values, revealed, seconds: 0, won: false };
    saveState();
    resume(S);
  }

  function resume(st) {
    S = st; selected = null; dir = 'across';
    $('info-mode').textContent = S.mode === 'daily' ? 'Dnevna križaljka' : 'Vježba';
    $('info-day').textContent = S.mode === 'daily' ? fmtDay(S.day) : 'Nasumična';
    $('paused').hidden = true;
    show('game');
    buildGrid();
    selectFirstCell();
    renderAll();
    startTimer();
  }

  // ---------- grid helpers ----------
  function wordAt(r, c, d) {
    return S.grid.clues.find(cl => {
      if (cl.dir !== d) return false;
      if (d === 'across') return cl.row === r && c >= cl.col && c < cl.col + cl.length;
      return cl.col === c && r >= cl.row && r < cl.row + cl.length;
    });
  }

  function cellsOfWord(cl) {
    const list = [];
    for (let i = 0; i < cl.length; i++) list.push(cl.dir === 'across' ? [cl.row, cl.col + i] : [cl.row + i, cl.col]);
    return list;
  }

  function selectFirstCell() {
    const first = S.grid.clues[0];
    if (first) { selected = { r: first.row, c: first.col }; dir = first.dir; }
  }

  function buildGrid() {
    const g = S.grid;
    const el = $('kgrid');
    // Fit the grid to the screen width (minus the scroll container's border) instead of a fixed cell size.
    const avail = document.querySelector('.kgrid-scroll').clientWidth || 320;
    const cell = Math.max(18, Math.min(28, Math.floor((avail - 4) / g.cols)));
    el.style.setProperty('--cell', cell + 'px');
    el.style.gridTemplateColumns = `repeat(${g.cols}, var(--cell))`;
    el.style.gridTemplateRows = `repeat(${g.rows}, var(--cell))`;
    el.innerHTML = '';
    cellEls.length = 0;
    for (let r = 0; r < g.rows; r++) {
      const row = [];
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r][c];
        const btn = document.createElement('button');
        btn.className = 'kcell' + (cell ? '' : ' block');
        if (cell) {
          if (cell.number) { const n = document.createElement('span'); n.className = 'kn'; n.textContent = cell.number; btn.appendChild(n); }
          const letterSpan = document.createElement('span');
          letterSpan.className = 'kletter';
          btn.appendChild(letterSpan);
          btn.onclick = () => selectCell(r, c);
        }
        el.appendChild(btn);
        row.push(btn);
      }
      cellEls.push(row);
    }
  }

  function selectCell(r, c) {
    if (selected && selected.r === r && selected.c === c) {
      // tap again: flip direction if both are available here
      const other = dir === 'across' ? 'down' : 'across';
      if (wordAt(r, c, other)) dir = other;
    } else {
      selected = { r, c };
      if (!wordAt(r, c, dir)) dir = dir === 'across' ? 'down' : 'across';
    }
    renderAll();
    focusHiddenInput();
  }

  // Typing goes through a hidden text input so the phone's own keyboard (with its own
  // Croatian diacritics) pops up, instead of a custom on-screen one.
  function focusHiddenInput() {
    const input = $('hidden-input');
    input.value = '';
    input.focus({ preventScroll: true });
  }

  // ---------- typing ----------
  function nextClue(cl, delta) {
    const list = S.grid.clues;
    const idx = list.findIndex(c => c.number === cl.number && c.dir === cl.dir);
    const n = list[(idx + delta + list.length) % list.length];
    return n;
  }

  function typeLetter(letter) {
    if (S.won || !selected) return;
    const { r, c } = selected;
    if (!S.grid.cells[r][c]) return;
    S.values[r][c] = letter;
    S.revealed[r][c] = false;
    const cl = wordAt(r, c, dir);
    const cells = cellsOfWord(cl);
    const idx = cells.findIndex(([cr, cc]) => cr === r && cc === c);
    if (idx < cells.length - 1) {
      selected = { r: cells[idx + 1][0], c: cells[idx + 1][1] };
    } else {
      const n = nextClue(cl, 1);
      if (n) { selected = { r: n.row, c: n.col }; dir = n.dir; }
    }
    afterChange();
  }

  function backspace() {
    if (S.won || !selected) return;
    const { r, c } = selected;
    if (!S.grid.cells[r][c]) return;
    const cl = wordAt(r, c, dir);
    const cells = cellsOfWord(cl);
    const idx = cells.findIndex(([cr, cc]) => cr === r && cc === c);
    if (S.values[r][c]) {
      S.values[r][c] = '';
    } else if (idx > 0) {
      selected = { r: cells[idx - 1][0], c: cells[idx - 1][1] };
      S.values[selected.r][selected.c] = '';
    }
    afterChange();
  }

  function revealLetter() {
    if (S.won || !selected) return;
    const { r, c } = selected;
    if (!S.grid.cells[r][c]) return;
    const correct = S.grid.cells[r][c].letter;
    if (E.normalize(S.values[r][c]) !== E.normalize(correct)) S.revealed[r][c] = true;
    S.values[r][c] = correct;
    afterChange();
  }

  function revealWord() {
    if (S.won || !selected) return;
    const cl = wordAt(selected.r, selected.c, dir);
    if (!cl) return;
    for (const [r, c] of cellsOfWord(cl)) {
      const correct = S.grid.cells[r][c].letter;
      if (E.normalize(S.values[r][c]) !== E.normalize(correct)) S.revealed[r][c] = true;
      S.values[r][c] = correct;
    }
    afterChange();
  }

  function clearWord() {
    if (S.won || !selected) return;
    const cl = wordAt(selected.r, selected.c, dir);
    if (!cl) return;
    for (const [r, c] of cellsOfWord(cl)) { S.values[r][c] = ''; S.revealed[r][c] = false; }
    afterChange();
  }

  function hintsUsed() { return S.revealed.reduce((a, row) => a + row.filter(Boolean).length, 0); }

  function isComplete() {
    const g = S.grid;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      if (!cell) continue;
      if (E.normalize(S.values[r][c] || '') !== E.normalize(cell.letter)) return false;
    }
    return true;
  }

  function afterChange() {
    renderAll();
    saveState();
    if (isComplete()) win();
  }

  // ---------- rendering ----------
  function renderAll() {
    renderGrid();
    renderClueBar();
    renderClueLists();
    $('hints').textContent = hintsUsed();
  }

  function renderGrid() {
    const g = S.grid;
    const cl = selected ? wordAt(selected.r, selected.c, dir) : null;
    const activeCells = cl ? new Set(cellsOfWord(cl).map(([r, c]) => r + ',' + c)) : new Set();
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      if (!g.cells[r][c]) continue;
      const btn = cellEls[r][c];
      const classes = ['kcell'];
      if (selected && selected.r === r && selected.c === c) classes.push('selected');
      else if (activeCells.has(r + ',' + c)) classes.push('peer');
      if (S.revealed[r][c]) classes.push('revealed');
      btn.className = classes.join(' ');
      btn.querySelector('.kletter').textContent = S.values[r][c] || '';
    }
  }

  function renderClueBar() {
    if (!selected) return;
    const cl = wordAt(selected.r, selected.c, dir);
    if (!cl) return;
    $('clue-num').textContent = `${cl.number}${cl.dir === 'across' ? 'V' : 'O'}`;
    $('clue-text').textContent = cl.clue;
  }

  function wordDone(cl) {
    return cellsOfWord(cl).every(([r, c]) => E.normalize(S.values[r][c] || '') === E.normalize(S.grid.cells[r][c].letter));
  }

  function renderClueLists() {
    const across = $('clues-across'), down = $('clues-down');
    across.innerHTML = ''; down.innerHTML = '';
    const activeCl = selected ? wordAt(selected.r, selected.c, dir) : null;
    for (const cl of S.grid.clues) {
      const li = document.createElement('li');
      const active = activeCl && activeCl.number === cl.number && activeCl.dir === cl.dir;
      if (active) li.classList.add('active');
      if (wordDone(cl)) li.classList.add('done');
      li.innerHTML = `<b>${cl.number}.</b><span>${esc(cl.clue)}</span>`;
      li.onclick = () => { selected = { r: cl.row, c: cl.col }; dir = cl.dir; renderAll(); focusHiddenInput(); };
      (cl.dir === 'across' ? across : down).appendChild(li);
    }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- timer ----------
  function startTimer() {
    stopTimer();
    if (S.won) return;
    tick = setInterval(() => { S.seconds++; $('timer').textContent = fmt(S.seconds); if (S.seconds % 5 === 0) saveState(); }, 1000);
  }
  function stopTimer() { if (tick) { clearInterval(tick); tick = null; saveState(); } }
  function pause() { if (!S || S.won) return; stopTimer(); $('paused').hidden = false; $('hidden-input').blur(); }
  function unpause() { $('paused').hidden = true; startTimer(); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !$('game').hidden && S && !S.won) pause();
  });

  // ---------- win ----------
  async function win() {
    S.won = true; stopTimer(); $('hidden-input').blur();
    const hints = hintsUsed();
    saveState();
    const entry = { game: 'krizaljka', mode: S.mode, level: S.mode === 'daily' ? 'dnevna' : 'vjezba', day: S.day, seconds: S.seconds, mistakes: 0, hints, score: S.seconds + hints * PENALTY_HINT_SECONDS };
    if (S.mode === 'daily') localStorage.setItem(dailyDoneKey(S.day), JSON.stringify(entry));
    $('win-summary').textContent = S.mode === 'daily' ? `Dnevna križaljka · ${fmtDay(S.day)}` : 'Vježba';
    $('win-time').textContent = fmt(S.seconds);
    $('win-score-points').textContent = pointsFor(entry);
    $('win-rank').textContent = hints ? `Otkriveno slova: ${hints}.` : 'Bez pomoći. Bravo!';
    setTimeout(() => { $('win').hidden = false; }, 500);
    await Scores.submit(entry);
    if (S.mode === 'daily') {
      const list = (await Scores.list({ game: 'krizaljka', mode: 'daily', day: S.day })).sort((a, b) => a.score - b.score);
      const pos = list.findIndex(x => x.player === Scores.getPlayer() && x.score === entry.score) + 1;
      if (pos > 0 && list.length > 1) $('win-rank').textContent += ` Danas si ${pos}. od ${list.length}.`;
    }
  }

  // ---------- leaderboard ----------
  let scoreTab = 'today';
  async function openScores(tab) {
    if (tab) scoreTab = tab;
    show('scores');
    for (const b of $('score-tabs').children) b.classList.toggle('active', b.dataset.tab === scoreTab);
    $('score-note').textContent = Scores.remote ? '' : 'Rezultati su zasad spremljeni samo na ovom mobitelu.';
    const all = await Scores.list({ game: 'krizaljka' });
    const body = $('score-body');
    body.innerHTML = '';
    const me = Scores.getPlayer();
    const delBtn = r => r.player === me ? `<button class="score-del" data-game="${r.game}" data-player="${esc(r.player)}" data-at="${esc(r.at)}" data-day="${esc(r.day || '')}" data-mode="${esc(r.mode || '')}" aria-label="Izbriši">🗑</button>` : '';
    const group = (title, rows, sub) => {
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = `<h3>${title}</h3>` + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">${sub(r)}</div></span><span class="t">${fmt(r.score)}</span>${delBtn(r)}</div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
    };
    const detail = r => `vrijeme ${fmt(r.seconds)} · otkriveno ${r.hints}`;
    if (scoreTab === 'today') {
      const d = today();
      group(`Dnevna križaljka · ${fmtDay(d)}`, all.filter(s => s.mode === 'daily' && s.day === d).sort((a, b) => a.score - b.score), detail);
    } else {
      const totalSeconds = all.reduce((a, s) => a + s.seconds, 0);
      const tiles = [
        ['Riješeno', all.length, 'križaljki ukupno'],
        ['Vrijeme igre', fmt(totalSeconds), 'ukupno'],
        ['Dani igranja', new Set(all.map(s => s.day)).size, 'dana s rezultatom'],
        ['Najbolje vrijeme', all.length ? fmt(Math.min(...all.map(s => s.score))) : '–', '']
      ];
      const tg = document.createElement('div'); tg.className = 'totals-grid';
      tg.innerHTML = tiles.map(([label, val, sub]) => `<div class="totals-tile"><strong>${val}</strong><span>${label}${sub ? ' · ' + sub : ''}</span></div>`).join('');
      body.appendChild(tg);

      const players = [...new Set(all.map(s => s.player))];
      const wins = {};
      const daily = all.filter(s => s.mode === 'daily');
      const byDay = {};
      for (const s of daily) (byDay[s.day] = byDay[s.day] || []).push(s);
      for (const arr of Object.values(byDay)) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => a.score - b.score);
        wins[arr[0].player] = (wins[arr[0].player] || 0) + 1;
      }
      const rows = players.map(p => {
        const mine = all.filter(s => s.player === p);
        const points = mine.reduce((a, s) => a + pointsFor(s), 0);
        return { player: p, solved: mine.length, wins: wins[p] || 0, points, avg: mine.reduce((a, s) => a + s.score, 0) / (mine.length || 1) };
      }).sort((a, b) => b.points - a.points || b.wins - a.wins);
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = '<h3>Bodovna ljestvica</h3>' + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">riješeno ${r.solved} · pobjede ${r.wins} 🏆 · prosjek ${fmt(r.avg)}</div></span><span class="t">${r.points} b.</span></div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
      const p = document.createElement('p'); p.className = 'muted small';
      p.textContent = `Bodovi po križaljci: ${BASE_POINTS} osnovnih, minus ${HINT_POINT_COST} po otkrivenom slovu, uz bonus +${CLEAN_BONUS} bez pomoći. 🏆 = broj dana kad je igrač bio najbrži.`;
      body.appendChild(p);
    }
  }

  $('score-body').addEventListener('click', async e => {
    const btn = e.target.closest('.score-del');
    if (!btn) return;
    const ok = await UI.confirm('Izbrisati ovaj rezultat?');
    if (!ok) return;
    const entry = { game: btn.dataset.game, player: btn.dataset.player, at: btn.dataset.at };
    await Scores.remove(entry);
    if (btn.dataset.mode === 'daily') localStorage.removeItem(dailyDoneKey(btn.dataset.day));
    openScores();
  });

  // ---------- wiring ----------
  $('hidden-input').addEventListener('input', e => {
    const input = e.target;
    const data = e.data != null ? e.data : input.value;
    if (e.inputType === 'deleteContentBackward' || (!data && input.value === '')) {
      backspace();
    } else if (data) {
      const ch = [...data].pop(); // last character typed, in case of odd autocomplete batches
      if (/[a-zA-ZčćžšđČĆŽŠĐ]/.test(ch)) typeLetter(ch.toUpperCase());
    }
    input.value = '';
  });
  $('hidden-input').addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !e.target.value) { backspace(); e.preventDefault(); }
  });
  $('player').addEventListener('change', e => { Scores.setPlayer(e.target.value); e.target.classList.remove('need'); });
  $('btn-daily').onclick = startDaily;
  $('btn-free').onclick = startFree;
  $('btn-continue').onclick = () => resume(loadState());
  $('btn-menu').onclick = () => { stopTimer(); show('menu'); renderMenu(); };
  $('btn-pause').onclick = pause;
  $('btn-resume').onclick = unpause;
  $('t-reveal-letter').onclick = revealLetter;
  $('t-reveal-word').onclick = revealWord;
  $('t-clear').onclick = clearWord;
  $('clue-bar').onclick = () => { if (!selected) return; const other = dir === 'across' ? 'down' : 'across'; if (wordAt(selected.r, selected.c, other)) { dir = other; renderAll(); } focusHiddenInput(); };
  $('btn-scores').onclick = () => openScores();
  $('btn-scores-back').onclick = () => { show('menu'); renderMenu(); };
  for (const b of $('score-tabs').children) b.onclick = () => openScores(b.dataset.tab);
  $('btn-win-new').onclick = () => { $('win').hidden = true; show('menu'); renderMenu(); };
  $('btn-win-scores').onclick = () => { $('win').hidden = true; openScores('today'); };

  document.addEventListener('keydown', e => {
    if ($('game').hidden || !S) return;
    const onHiddenInput = e.target === $('hidden-input');
    if (e.target.tagName === 'INPUT' && !onHiddenInput) return; // e.g. the player name field
    const k = e.key;
    // Typing itself is handled by the hidden input's own listeners (so the phone keyboard
    // works); here we only need Backspace/letters for a physical keyboard with nothing focused.
    if (!onHiddenInput) {
      if (k === 'Backspace') { backspace(); e.preventDefault(); return; }
      if (k.length === 1 && /[a-zA-ZčćžšđČĆŽŠĐ]/.test(k)) { typeLetter(k.toUpperCase()); e.preventDefault(); return; }
    }
    if (!selected) return;
    const g = S.grid;
    if (k.startsWith('Arrow')) {
      let { r, c } = selected;
      if (k === 'ArrowUp') r = (r + g.rows - 1) % g.rows;
      if (k === 'ArrowDown') r = (r + 1) % g.rows;
      if (k === 'ArrowLeft') c = (c + g.cols - 1) % g.cols;
      if (k === 'ArrowRight') c = (c + 1) % g.cols;
      if (g.cells[r][c]) { selected = { r, c }; renderAll(); focusHiddenInput(); }
      e.preventDefault();
    }
  });

  renderMenu();
})();
