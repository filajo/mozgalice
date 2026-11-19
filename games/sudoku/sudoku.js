(function () {
  const E = window.SudokuEngine;
  const LEVELS = E.LEVELS;
  const STATE_KEY = 'sudoku.state';
  const MAX_MISTAKES = 3;
  const PENALTY_MISTAKE = 30, PENALTY_HINT = 60; // seconds added to the score
  // Points-based scoring (for the all-players leaderboard): harder levels are worth more,
  // mistakes/hints cost points, a clean solve earns a bonus.
  const LEVEL_POINTS = { easy: 10, medium: 20, hard: 35, expert: 50 };
  function pointsFor(entry) {
    const base = LEVEL_POINTS[entry.level] || 15;
    let p = base - entry.mistakes * 2 - entry.hints * 3;
    if (entry.mistakes === 0 && entry.hints === 0) p += 5;
    return Math.max(Math.round(base * 0.4), p);
  }

  const $ = id => document.getElementById(id);
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDay = d => { const [y, m, dd] = d.split('-'); return `${+dd}.${+m}.${y}.`; };
  const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Mon–Sun days of the current ISO week.
  function weekDays() {
    const d = new Date(); const offset = (d.getDay() + 6) % 7;
    const monday = new Date(d); monday.setDate(d.getDate() - offset);
    return [...Array(7).keys()].map(i => { const x = new Date(monday); x.setDate(monday.getDate() + i); return dstr(x); });
  }

  let S = null;          // current game state
  let selected = -1;
  let notesMode = false;
  let tick = null;
  const cells = [];

  // ---------- persistence ----------
  const saveState = () => { if (S) localStorage.setItem(STATE_KEY, JSON.stringify(S)); };
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; } };
  const dailyDoneKey = (day, level) => `sudoku.daily.${day}.${level}`;

  // ---------- screens ----------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    if (id !== 'game') stopTimer();
    window.scrollTo(0, 0);
  }

  function renderMenu() {
    $('player').value = Scores.getPlayer();
    const st = loadState();
    const canContinue = st && !st.won && !(st.mode === 'daily' && st.day !== today());
    $('btn-continue').hidden = !canContinue;
    if (canContinue) $('continue-info').textContent = `${st.mode === 'daily' ? 'Dnevni izazov' : 'Slobodna igra'} · ${LEVELS[st.level].label} · ${fmt(st.seconds)}`;

    const d = today();
    $('daily-levels').innerHTML = ''; $('free-levels').innerHTML = '';
    for (const [key, L] of Object.entries(LEVELS)) {
      const done = JSON.parse(localStorage.getItem(dailyDoneKey(d, key)) || 'null');
      const b = document.createElement('button');
      b.className = 'level-btn' + (done ? ' done' : '');
      b.innerHTML = `<strong>${L.label}</strong><span>${done ? '✓ ' + fmt(done.score) : 'Igraj'}</span>`;
      b.onclick = () => done ? openScores('today') : startGame('daily', key);
      $('daily-levels').appendChild(b);

      const f = document.createElement('button');
      f.className = 'level-btn';
      f.innerHTML = `<strong>${L.label}</strong><span>Nova zagonetka</span>`;
      f.onclick = () => startGame('free', key);
      $('free-levels').appendChild(f);
    }
    renderSideStats();
  }

  async function renderSideStats() {
    const player = Scores.getPlayer();
    if (!player) { $('stat-today').textContent = '–'; $('stat-week').textContent = '–'; $('stat-total').textContent = '–'; return; }
    const mine = await Scores.list({ game: 'sudoku', player });
    const d = today(), week = weekDays();
    const todays = mine.filter(s => s.day === d);
    const weeks = mine.filter(s => week.includes(s.day));
    $('stat-today').textContent = todays.length;
    $('stat-today-sub').textContent = todays.length ? `najbolje ${fmt(Math.min(...todays.map(s => s.score)))}` : 'još ništa';
    $('stat-week').textContent = weeks.length;
    $('stat-week-sub').textContent = weeks.length ? `ukupno ${fmt(weeks.reduce((a, s) => a + s.seconds, 0))}` : 'još ništa';
    $('stat-total').textContent = mine.length;
  }

  // ---------- game ----------
  async function startGame(mode, level) {
    const st = loadState();
    if (mode === 'daily' && st && !st.won && st.mode === 'daily' && st.level === level && st.day === today()) {
      return resume(st); // same daily already in progress
    }
    if (st && !st.won) {
      const ok = await UI.confirm('Imaš nezavršenu igru. Ako započneš novu, ta igra se gubi (ne broji se u statistiku). Nastaviti?');
      if (!ok) return;
    }
    if (!ensurePlayer()) return;
    const day = today();
    const g = E.generate(level, mode === 'daily' ? `${day}:${level}` : null);
    S = {
      mode, level, day,
      puzzle: g.puzzle, solution: g.solution, values: g.puzzle.slice(),
      notes: new Array(81).fill(0), mistakes: 0, hints: 0, seconds: 0,
      history: [], won: false
    };
    saveState();
    resume(S);
  }

  function ensurePlayer() {
    const v = $('player').value.trim();
    if (v) { Scores.setPlayer(v); return true; }
    $('player').focus();
    $('player').placeholder = 'Upiši ime za ljestvicu';
    $('player').classList.add('need');
    return false;
  }

  function resume(st) {
    S = st; selected = -1; notesMode = false;
    $('info-level').textContent = LEVELS[S.level].label;
    $('info-mode').textContent = S.mode === 'daily' ? `Dnevni izazov · ${fmtDay(S.day)}` : 'Slobodna igra';
    $('paused').hidden = true;
    show('game');
    renderBoard();
    startTimer();
  }

  function buildBoard() {
    const board = $('board');
    for (let i = 0; i < 81; i++) {
      const c = document.createElement('button');
      c.className = 'cell';
      c.setAttribute('role', 'gridcell');
      c.onclick = () => { selected = i; renderBoard(); };
      board.appendChild(c); cells.push(c);
    }
    const pad = $('numpad');
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement('button');
      b.className = 'num'; b.dataset.n = n;
      b.innerHTML = `${n}<small></small>`;
      b.onclick = () => input(n);
      pad.appendChild(b);
    }
  }

  function renderBoard() {
    const v = S.values;
    const selVal = selected >= 0 ? v[selected] : 0;
    for (let i = 0; i < 81; i++) {
      const c = cells[i];
      const val = v[i];
      const cls = ['cell'];
      if (S.puzzle[i]) cls.push('given');
      if (selected >= 0) {
        if (i === selected) cls.push('selected');
        else if (selVal && val === selVal) cls.push('same');
        else if (E.ROW(i) === E.ROW(selected) || E.COL(i) === E.COL(selected) || E.BOX(i) === E.BOX(selected)) cls.push('peer');
      }
      if (val && val !== S.solution[i]) cls.push('error');
      c.className = cls.join(' ');
      if (val) c.textContent = val;
      else if (S.notes[i]) {
        let h = '<div class="notes">';
        for (let n = 1; n <= 9; n++) h += `<span class="${selVal === n ? 'hl' : ''}">${S.notes[i] & (1 << n) ? n : ''}</span>`;
        c.innerHTML = h + '</div>';
      } else c.textContent = '';
    }
    // remaining count per number
    const count = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (v[i] && v[i] === S.solution[i]) count[v[i]]++;
    for (const b of $('numpad').children) {
      const n = +b.dataset.n, left = 9 - count[n];
      b.querySelector('small').textContent = left;
      b.classList.toggle('complete', left === 0);
    }
    $('mistakes').textContent = S.mistakes;
    $('hints').textContent = S.hints;
    $('timer').textContent = fmt(S.seconds);
    $('t-notes').classList.toggle('on', notesMode);
    $('notes-state').textContent = notesMode ? 'UKLJ' : 'ISKLJ';
    $('t-undo').disabled = S.history.length === 0;
  }

  function pushHistory(i) { S.history.push([i, S.values[i], S.notes[i]]); if (S.history.length > 200) S.history.shift(); }

  function input(n) {
    if (S.won || S.lost || selected < 0 || S.puzzle[selected]) return;
    const i = selected;
    if (S.values[i] === S.solution[i] && S.values[i]) return; // correct cells are locked
    if (notesMode) {
      if (S.values[i]) return;
      pushHistory(i);
      S.notes[i] ^= (1 << n);
    } else {
      if (S.values[i] === n) return;
      pushHistory(i);
      S.values[i] = n;
      S.notes[i] = 0;
      if (n !== S.solution[i]) {
        S.mistakes++;
        if (S.mistakes >= MAX_MISTAKES) { renderBoard(); gameOver(); return; }
      } else {
        // clear this number from notes of peers
        for (const p of E.PEERS[i]) S.notes[p] &= ~(1 << n);
        flashCompleted(i);
      }
    }
    afterChange();
  }

  function gameOver() {
    S.lost = true; stopTimer();
    localStorage.removeItem(STATE_KEY);
    setTimeout(() => { $('gameover').hidden = false; }, 400);
  }

  async function restartPuzzle() {
    if (!S || S.won) return;
    const ok = await UI.confirm('Restartati ovu zagonetku? Napredak se gubi.');
    if (!ok) return;
    S.values = S.puzzle.slice(); S.notes = new Array(81).fill(0);
    S.mistakes = 0; S.hints = 0; S.seconds = 0; S.history = []; S.lost = false;
    selected = -1; notesMode = false;
    $('gameover').hidden = true;
    saveState();
    renderBoard();
    startTimer();
  }

  function flashCompleted(i) {
    const groups = [
      [...Array(9).keys()].map(k => E.ROW(i) * 9 + k),
      [...Array(9).keys()].map(k => k * 9 + E.COL(i)),
      [...Array(81).keys()].filter(k => E.BOX(k) === E.BOX(i))
    ];
    for (const g of groups) {
      if (g.every(k => S.values[k] === S.solution[k])) {
        g.forEach((k, idx) => setTimeout(() => {
          cells[k].classList.remove('flash'); void cells[k].offsetWidth; cells[k].classList.add('flash');
        }, idx * 30));
      }
    }
  }

  function erase() {
    if (S.won || S.lost || selected < 0 || S.puzzle[selected]) return;
    const i = selected;
    if (S.values[i] && S.values[i] === S.solution[i]) return;
    if (!S.values[i] && !S.notes[i]) return;
    pushHistory(i);
    S.values[i] = 0; S.notes[i] = 0;
    afterChange();
  }

  function undo() {
    if (S.won || S.lost) return;
    const h = S.history.pop();
    if (!h) return;
    const [i, val, notes] = h;
    S.values[i] = val; S.notes[i] = notes; selected = i;
    afterChange();
  }

  function hint() {
    if (S.won || S.lost) return;
    let i = selected;
    if (i < 0 || S.values[i] === S.solution[i]) {
      // pick an empty or wrong cell, preferring the one with fewest candidates
      const empty = [...Array(81).keys()].filter(k => S.values[k] !== S.solution[k]);
      if (!empty.length) return;
      i = empty[Math.floor(Math.random() * empty.length)];
    }
    pushHistory(i);
    S.values[i] = S.solution[i]; S.notes[i] = 0; S.hints++;
    for (const p of E.PEERS[i]) S.notes[p] &= ~(1 << S.values[i]);
    selected = i;
    flashCompleted(i);
    afterChange();
  }

  function afterChange() {
    renderBoard();
    if (S.values.every((v, i) => v === S.solution[i])) win();
    saveState();
  }

  async function win() {
    S.won = true; stopTimer();
    const score = S.seconds + S.mistakes * PENALTY_MISTAKE + S.hints * PENALTY_HINT;
    saveState();
    const entry = { game: 'sudoku', mode: S.mode, level: S.level, day: S.day, seconds: S.seconds, mistakes: S.mistakes, hints: S.hints, score };
    if (S.mode === 'daily') localStorage.setItem(dailyDoneKey(S.day, S.level), JSON.stringify(entry));
    $('win-summary').textContent = `${S.mode === 'daily' ? 'Dnevni izazov' : 'Slobodna igra'} · ${LEVELS[S.level].label}`;
    $('win-time').textContent = fmt(S.seconds);
    $('win-points').textContent = fmt(score);
    $('win-score-points').textContent = pointsFor(entry);
    $('win-rank').textContent = (S.mistakes || S.hints)
      ? `Rezultat = vrijeme + ${PENALTY_MISTAKE} s po grešci (${S.mistakes}) + ${PENALTY_HINT} s po pomoći (${S.hints}).`
      : 'Bez grešaka i bez pomoći. Bravo!';
    setTimeout(() => { $('win').hidden = false; }, 700);
    await Scores.submit(entry);
    if (S.mode === 'daily') {
      const list = (await Scores.list({ game: 'sudoku', mode: 'daily', day: S.day, level: S.level })).sort((a, b) => a.score - b.score);
      const pos = list.findIndex(x => x.player === Scores.getPlayer() && x.score === score) + 1;
      if (pos > 0 && list.length > 1) $('win-rank').textContent += ` Danas si ${pos}. od ${list.length}.`;
    }
  }

  // ---------- timer ----------
  function startTimer() {
    stopTimer();
    if (S.won) return;
    tick = setInterval(() => { S.seconds++; $('timer').textContent = fmt(S.seconds); if (S.seconds % 5 === 0) saveState(); }, 1000);
  }
  function stopTimer() { if (tick) { clearInterval(tick); tick = null; saveState(); } }
  function pause() { if (S.won || S.lost) return; stopTimer(); $('paused').hidden = false; }
  function unpause() { $('paused').hidden = true; startTimer(); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !$('game').hidden && S && !S.won && !S.lost) pause();
  });

  // ---------- leaderboard ----------
  let scoreTab = 'today';
  async function openScores(tab) {
    if (tab) scoreTab = tab;
    show('scores');
    for (const b of $('score-tabs').children) b.classList.toggle('active', b.dataset.tab === scoreTab);
    $('score-note').textContent = Scores.remote ? '' : 'Rezultati su zasad spremljeni samo na ovom mobitelu.';
    const all = (await Scores.list({ game: 'sudoku' }));
    const body = $('score-body');
    body.innerHTML = '';
    const me = Scores.getPlayer();
    const delBtn = r => r.player === me ? `<button class="score-del" data-game="${r.game}" data-player="${esc(r.player)}" data-at="${esc(r.at)}" data-level="${esc(r.level || '')}" data-day="${esc(r.day || '')}" data-mode="${esc(r.mode || '')}" aria-label="Izbriši">🗑</button>` : '';
    const group = (title, rows, sub) => {
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = `<h3>${title}</h3>` + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">${sub(r)}</div></span><span class="t">${fmt(r.score)}</span>${delBtn(r)}</div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
    };
    const detail = r => `vrijeme ${fmt(r.seconds)} · greške ${r.mistakes} · pomoć ${r.hints}`;
    if (scoreTab === 'today') {
      const d = today();
      for (const [k, L] of Object.entries(LEVELS)) {
        group(`${L.label} · ${fmtDay(d)}`, all.filter(s => s.mode === 'daily' && s.day === d && s.level === k).sort((a, b) => a.score - b.score), detail);
      }
    } else if (scoreTab === 'week') {
      const week = weekDays();
      for (const [k, L] of Object.entries(LEVELS)) {
        group(`${L.label} · ovaj tjedan`,
          all.filter(s => s.mode === 'daily' && week.includes(s.day) && s.level === k).sort((a, b) => a.score - b.score),
          r => `${detail(r)} · ${fmtDay(r.day)}`);
      }
    } else if (scoreTab === 'best') {
      for (const [k, L] of Object.entries(LEVELS)) {
        group(L.label, all.filter(s => s.level === k).sort((a, b) => a.score - b.score).slice(0, 10),
          r => `${detail(r)} · ${fmtDay(r.day)}`);
      }
    } else {
      // stats: overall totals, then per player, daily head-to-head wins + solved counts
      const totalSeconds = all.reduce((a, s) => a + s.seconds, 0);
      const totalDays = new Set(all.map(s => s.day)).size;
      const tiles = [
        ['Riješeno', all.length, 'zagonetki ukupno'],
        ['Vrijeme igre', fmt(totalSeconds), 'ukupno'],
        ['Dani igranja', totalDays, 'dana s rezultatom'],
        ['Najbolji rezultat', all.length ? fmt(Math.min(...all.map(s => s.score))) : '–', 'svih razina']
      ];
      const tg = document.createElement('div'); tg.className = 'totals-grid';
      tg.innerHTML = tiles.map(([label, val, sub]) => `<div class="totals-tile"><strong>${val}</strong><span>${label} · ${sub}</span></div>`).join('');
      body.appendChild(tg);

      const players = [...new Set(all.map(s => s.player))];
      const wins = {};
      const daily = all.filter(s => s.mode === 'daily');
      const byKey = {};
      for (const s of daily) (byKey[s.day + s.level] = byKey[s.day + s.level] || []).push(s);
      for (const arr of Object.values(byKey)) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => a.score - b.score);
        wins[arr[0].player] = (wins[arr[0].player] || 0) + 1;
      }
      const rows = players.map(p => {
        const mine = all.filter(s => s.player === p);
        const points = mine.reduce((a, s) => a + pointsFor(s), 0);
        return { player: p, solved: mine.length, wins: wins[p] || 0, points, avg: mine.reduce((a, s) => a + s.score, 0) / (mine.length || 1) };
      }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.solved - a.solved);
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = '<h3>Bodovna ljestvica</h3>' + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">riješeno ${r.solved} · pobjede ${r.wins} 🏆 · prosjek ${fmt(r.avg)}</div></span><span class="t">${r.points} b.</span></div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
      const p = document.createElement('p'); p.className = 'muted small';
      p.textContent = 'Bodovi po riješenoj zagonetki: Lako 10 · Srednje 20 · Teško 35 · Stručnjak 50, minus 2 po grešci i 3 po pomoći, uz bonus +5 za rješenje bez ijedne greške i pomoći. 🏆 = broj dnevnih izazova u kojima je igrač bio najbrži.';
      body.appendChild(p);
    }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  $('score-body').addEventListener('click', async e => {
    const btn = e.target.closest('.score-del');
    if (!btn) return;
    const ok = await UI.confirm('Izbrisati ovaj rezultat?');
    if (!ok) return;
    const entry = { game: btn.dataset.game, player: btn.dataset.player, at: btn.dataset.at };
    await Scores.remove(entry);
    if (btn.dataset.mode === 'daily') {
      const key = dailyDoneKey(btn.dataset.day, btn.dataset.level);
      const done = JSON.parse(localStorage.getItem(key) || 'null');
      if (done && done.day === btn.dataset.day) localStorage.removeItem(key);
    }
    openScores();
  });

  // ---------- wiring ----------
  buildBoard();
  $('player').addEventListener('change', e => { Scores.setPlayer(e.target.value); e.target.classList.remove('need'); renderSideStats(); });
  $('btn-total-stats').onclick = () => openScores('stats');
  $('btn-continue').onclick = () => resume(loadState());
  $('btn-menu').onclick = () => { stopTimer(); show('menu'); renderMenu(); };
  $('btn-pause').onclick = pause;
  $('btn-resume').onclick = unpause;
  $('btn-restart').onclick = restartPuzzle;
  $('btn-gameover-new').onclick = () => { $('gameover').hidden = true; startGame(S.mode, S.level); };
  $('btn-gameover-menu').onclick = () => { $('gameover').hidden = true; show('menu'); renderMenu(); };
  $('t-undo').onclick = undo;
  $('t-erase').onclick = erase;
  $('t-notes').onclick = () => { notesMode = !notesMode; renderBoard(); };
  $('t-hint').onclick = hint;
  $('btn-scores').onclick = () => openScores();
  $('btn-scores-back').onclick = () => { show('menu'); renderMenu(); };
  for (const b of $('score-tabs').children) b.onclick = () => openScores(b.dataset.tab);
  $('btn-win-new').onclick = () => { $('win').hidden = true; show('menu'); renderMenu(); };
  $('btn-win-scores').onclick = () => { $('win').hidden = true; openScores(S.mode === 'daily' ? 'today' : 'best'); };

  document.addEventListener('keydown', e => {
    if ($('game').hidden || !S || e.target.tagName === 'INPUT') return;
    if (e.key >= '1' && e.key <= '9') input(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; renderBoard(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
    else if (e.key.startsWith('Arrow')) {
      if (selected < 0) selected = 0;
      else {
        const r = E.ROW(selected), c = E.COL(selected);
        if (e.key === 'ArrowUp') selected = ((r + 8) % 9) * 9 + c;
        if (e.key === 'ArrowDown') selected = ((r + 1) % 9) * 9 + c;
        if (e.key === 'ArrowLeft') selected = r * 9 + (c + 8) % 9;
        if (e.key === 'ArrowRight') selected = r * 9 + (c + 1) % 9;
      }
      renderBoard(); e.preventDefault();
    } else return;
  });

  renderMenu();
})();
