(function () {
  const E = window.CestaEngine;
  const STATE_KEY = 'cesta.state';
  const QUESTION_SECONDS = 20;
  const BASE_POINTS = 60;

  const $ = id => document.getElementById(id);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDay = d => { const [y, m, dd] = d.split('-'); return `${+dd}.${+m}.${y}.`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tierFor(correct, elapsedSec) {
    if (!correct) return { label: 'Radovi na cesti', icon: '🚧', km: 0 };
    if (elapsedSec < 5) return { label: 'Avion', icon: '✈️', km: 170 };
    if (elapsedSec < 10) return { label: 'Auto', icon: '🚗', km: 110 };
    if (elapsedSec < 16) return { label: 'Bicikl', icon: '🚲', km: 70 };
    return { label: 'Pješice', icon: '🚶', km: 40 };
  }

  function pointsFor(entry) {
    let p = Math.round(entry.km / 10) - entry.mistakes * 2;
    if (entry.mistakes === 0) p += 10;
    return Math.max(0, p);
  }

  let S = null;
  let tickHandle = null;
  let qStart = 0;

  // ---------- persistence ----------
  const saveState = () => { if (S) localStorage.setItem(STATE_KEY, JSON.stringify(S)); };
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; } };
  const dailyDoneKey = day => `cesta.daily.${day}`;

  // ---------- screens ----------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
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
    const canContinue = st && !st.won && st.day === today();
    $('btn-continue').hidden = !canContinue;
    if (canContinue) $('continue-info').textContent = `Pitanje ${st.idx + 1} / ${st.questions.length} · ${st.km} km`;

    const d = today();
    const done = JSON.parse(localStorage.getItem(dailyDoneKey(d)) || 'null');
    $('btn-daily').textContent = done ? '✓ Riješeno danas' : (canContinue ? 'Nastavi' : 'Igraj');
    $('daily-done').hidden = !done;
    if (done) $('daily-done').textContent = `Danas si stigao/la ${done.km} km · točno ${done.correct}/${done.questions || 8}`;
  }

  // ---------- game setup ----------
  async function startDaily() {
    const st = loadState();
    const d = today();
    if (st && !st.won && st.day === d) return resume(st);
    if (st && !st.won) {
      const ok = await UI.confirm('Imaš nezavršen kviz. Ako započneš novi, taj napredak se gubi (ne broji se u statistiku). Nastaviti?');
      if (!ok) return;
    }
    if (!ensurePlayer()) return;
    const questions = E.pickDaily(d);
    S = { mode: 'daily', day: d, questions, idx: 0, km: 0, correct: 0, mistakes: 0, won: false };
    saveState();
    resume(S);
  }

  function resume(st) {
    S = st;
    show('game');
    renderRoute();
    showQuestion();
  }

  async function backToMenu() {
    if (S && !S.won) {
      const ok = await UI.confirm('Imaš nezavršen kviz. Ako izađeš sada, napredak se gubi (ne broji se u statistiku). Izaći?');
      if (!ok) return;
      stopTick();
      localStorage.removeItem(STATE_KEY);
      S = null;
    }
    show('menu'); renderMenu();
  }

  // ---------- route ----------
  function renderRoute() {
    const pos = E.positionOnRoute(S.km);
    const pct = Math.min(100, (S.km / E.GOAL_KM) * 100);
    $('route-fill').style.width = pct + '%';
    $('route-dot').style.left = pct + '%';
    $('route-from').textContent = E.ROUTE[0].name;
    $('route-to').textContent = E.ROUTE[E.ROUTE.length - 1].name;
    $('route-km').textContent = `${S.km} / ${E.GOAL_KM} km · trenutno kod: ${pos.to ? pos.from + ' → ' + pos.to : pos.from}`;
  }

  // ---------- question flow ----------
  function showQuestion() {
    $('feedback').hidden = true;
    const q = S.questions[S.idx];
    $('info-q').textContent = `${S.idx + 1} / ${S.questions.length}`;
    $('info-group').textContent = q.label;
    $('q-group').textContent = q.label;
    $('q-text').textContent = q.q;
    $('q-input').value = '';
    $('q-input').disabled = false;
    $('btn-answer').disabled = false;
    $('q-input').focus();
    startTimer();
  }

  function startTimer() {
    stopTick();
    qStart = performance.now();
    const fill = $('qtimer-fill');
    fill.classList.remove('low');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    tickHandle = setInterval(() => {
      const elapsed = (performance.now() - qStart) / 1000;
      const pct = Math.max(0, 1 - elapsed / QUESTION_SECONDS);
      fill.style.transition = 'width .1s linear';
      fill.style.width = (pct * 100) + '%';
      if (pct < 0.25) fill.classList.add('low');
      if (elapsed >= QUESTION_SECONDS) submitAnswer(true);
    }, 100);
  }

  function stopTick() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  function submitAnswer(timedOut) {
    if (!S || $('q-input').disabled) return;
    stopTick();
    $('q-input').disabled = true;
    $('btn-answer').disabled = true;
    const elapsed = Math.min(QUESTION_SECONDS, (performance.now() - qStart) / 1000);
    const q = S.questions[S.idx];
    const typed = $('q-input').value;
    const correct = !timedOut && E.isCorrect(typed, q.a);
    const tier = tierFor(correct, elapsed);
    S.km += tier.km;
    if (correct) S.correct++; else S.mistakes++;
    saveState();
    renderRoute();

    const fb = $('feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (correct ? 'correct' : 'wrong');
    $('feedback-icon').textContent = tier.icon;
    $('feedback-title').textContent = correct ? `Točno! ${tier.label}` : (timedOut ? 'Vrijeme je isteklo' : 'Netočno');
    $('feedback-sub').textContent = correct ? `+${tier.km} km · ${elapsed.toFixed(1)} s · točan odgovor: ${q.a[0]}` : `Točan odgovor: ${q.a[0]}`;

    setTimeout(() => {
      S.idx++;
      if (S.idx >= S.questions.length) finish();
      else { saveState(); showQuestion(); }
    }, 1400);
  }

  async function finish() {
    S.won = true;
    saveState();
    const entry = {
      game: 'cesta', mode: 'daily', day: S.day, seconds: 0, mistakes: S.mistakes, hints: 0,
      km: S.km, correct: S.correct, questions: S.questions.length, score: E.GOAL_KM - S.km
    };
    localStorage.setItem(dailyDoneKey(S.day), JSON.stringify(entry));
    const pos = E.positionOnRoute(S.km);
    $('win-title').textContent = S.km >= E.GOAL_KM ? 'Stigao/la si do Dubrovnika!' : 'Kviz gotov!';
    $('win-trophy').textContent = S.km >= E.GOAL_KM ? '🏆' : '🏁';
    $('win-summary').textContent = `Dnevni kviz · ${fmtDay(S.day)} · trenutno kod: ${pos.to ? pos.from + ' → ' + pos.to : pos.from}`;
    $('win-km').textContent = S.km;
    $('win-correct').textContent = `${S.correct}/${S.questions.length}`;
    $('win-score-points').textContent = pointsFor(entry);
    $('win-rank').textContent = '';
    setTimeout(() => { $('win').hidden = false; }, 400);
    await Scores.submit(entry);
    const list = (await Scores.list({ game: 'cesta', mode: 'daily', day: S.day })).sort((a, b) => a.score - b.score);
    const posRank = list.findIndex(x => x.player === Scores.getPlayer() && x.score === entry.score) + 1;
    if (posRank > 0 && list.length > 1) $('win-rank').textContent = `Danas si ${posRank}. od ${list.length}.`;
  }

  // ---------- leaderboard ----------
  let scoreTab = 'today';
  async function openScores(tab) {
    if (tab) scoreTab = tab;
    show('scores');
    for (const b of $('score-tabs').children) b.classList.toggle('active', b.dataset.tab === scoreTab);
    $('score-note').textContent = Scores.remote ? '' : 'Rezultati su zasad spremljeni samo na ovom mobitelu.';
    const all = await Scores.list({ game: 'cesta' });
    const body = $('score-body');
    body.innerHTML = '';
    const me = Scores.getPlayer();
    const delBtn = r => r.player === me ? `<button class="score-del" data-game="${r.game}" data-player="${esc(r.player)}" data-at="${esc(r.at)}" data-day="${esc(r.day || '')}" data-mode="${esc(r.mode || '')}" aria-label="Izbriši">🗑</button>` : '';
    const group = (title, rows, sub) => {
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = `<h3>${title}</h3>` + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">${sub(r)}</div></span><span class="t">${r.km} km</span>${delBtn(r)}</div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
    };
    const detail = r => `točno ${r.correct}/${r.questions || 8} · greške ${r.mistakes}`;
    if (scoreTab === 'today') {
      const d = today();
      group(`Dnevni kviz · ${fmtDay(d)}`, all.filter(s => s.mode === 'daily' && s.day === d).sort((a, b) => a.score - b.score), detail);
    } else {
      const totalKm = all.reduce((a, s) => a + s.km, 0);
      const tiles = [
        ['Odigrano', all.length, 'kvizova ukupno'],
        ['Ukupno km', totalKm, 'svih igrača'],
        ['Dani igranja', new Set(all.map(s => s.day)).size, 'dana s rezultatom'],
        ['Najdalje u jednom danu', all.length ? Math.max(...all.map(s => s.km)) : 0, 'km']
      ];
      const tg = document.createElement('div'); tg.className = 'totals-grid';
      tg.innerHTML = tiles.map(([label, val, sub]) => `<div class="totals-tile"><strong>${val}</strong><span>${label}${sub ? ' · ' + sub : ''}</span></div>`).join('');
      body.appendChild(tg);

      const players = [...new Set(all.map(s => s.player))];
      const wins = {};
      const byDay = {};
      for (const s of all) (byDay[s.day] = byDay[s.day] || []).push(s);
      for (const arr of Object.values(byDay)) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => b.km - a.km);
        wins[arr[0].player] = (wins[arr[0].player] || 0) + 1;
      }
      const rows = players.map(p => {
        const mine = all.filter(s => s.player === p);
        const points = mine.reduce((a, s) => a + pointsFor(s), 0);
        return { player: p, played: mine.length, wins: wins[p] || 0, points, avgKm: Math.round(mine.reduce((a, s) => a + s.km, 0) / (mine.length || 1)) };
      }).sort((a, b) => b.points - a.points || b.wins - a.wins);
      const g = document.createElement('div'); g.className = 'score-group';
      g.innerHTML = '<h3>Bodovna ljestvica</h3>' + (rows.length ? rows.map((r, i) =>
        `<div class="score-row"><span class="pos">${i + 1}.</span><span class="name">${esc(r.player)}<div class="sub">odigrano ${r.played} · pobjede ${r.wins} 🏆 · prosjek ${r.avgKm} km</div></span><span class="t">${r.points} b.</span></div>`
      ).join('') : '<div class="score-empty">Još nema rezultata.</div>');
      body.appendChild(g);
      const p = document.createElement('p'); p.className = 'muted small';
      p.textContent = 'Bodovi: 1 bod za svakih 10 prijeđenih km, minus 2 po grešci, uz bonus +10 bez ijedne greške. 🏆 = broj dana kad je igrač prešao najviše km.';
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
  $('player').addEventListener('change', e => { Scores.setPlayer(e.target.value); e.target.classList.remove('need'); });
  $('btn-daily').onclick = startDaily;
  $('btn-continue').onclick = () => resume(loadState());
  $('btn-menu').onclick = backToMenu;
  $('btn-answer').onclick = () => submitAnswer(false);
  $('q-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(false); });
  $('btn-scores').onclick = () => openScores();
  $('btn-scores-back').onclick = () => { show('menu'); renderMenu(); };
  for (const b of $('score-tabs').children) b.onclick = () => openScores(b.dataset.tab);
  $('btn-win-new').onclick = () => { $('win').hidden = true; show('menu'); renderMenu(); };
  $('btn-win-scores').onclick = () => { $('win').hidden = true; openScores('today'); };

  renderMenu();
})();
