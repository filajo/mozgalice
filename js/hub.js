// Logic for the hub page's "Statistika" tab: combines stats across all games.
(function () {
  const $ = id => document.getElementById(id);
  const GAME_NAMES = { sudoku: 'Sudoku', krizaljka: 'Križaljka', cesta: 'Cesta' };
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function weekDays() {
    const d = new Date(); const offset = (d.getDay() + 6) % 7;
    const monday = new Date(d); monday.setDate(d.getDate() - offset);
    return [...Array(7).keys()].map(i => { const x = new Date(monday); x.setDate(monday.getDate() + i); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  }

  let range = 'today';

  function switchTab(tab) {
    for (const b of document.querySelectorAll('#hub-tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
    $('tab-games').hidden = tab !== 'games';
    $('tab-stats').hidden = tab !== 'stats';
    if (tab === 'stats') renderStats();
  }

  async function renderStats() {
    $('player').value = Scores.getPlayer();
    $('stats-note').textContent = Scores.remote ? '' : 'Rezultati su zasad spremljeni samo na ovom mobitelu.';
    const player = Scores.getPlayer();
    if (!player) {
      $('stats-totals').innerHTML = '';
      $('stats-body').innerHTML = '<div class="score-empty">Upiši ime igrača da vidiš svoju statistiku.</div>';
      return;
    }
    const all = await Scores.list({ player });
    const d = todayStr(), week = weekDays();
    const inRange = s => range === 'today' ? s.day === d : range === 'week' ? week.includes(s.day) : true;
    const filtered = all.filter(inRange);

    const totalSeconds = filtered.reduce((a, s) => a + s.seconds, 0);
    // "Cesta" scores aren't time-based (lower score = more km, not fewer seconds), so it's left
    // out of the seconds-based best/average tiles below and reported via its own per-game row.
    const timeBased = filtered.filter(s => s.game !== 'cesta');
    const tiles = [
      ['Riješeno', filtered.length, 'zagonetki'],
      ['Vrijeme igre', fmt(totalSeconds), 'ukupno'],
    ];
    if (range === 'all') {
      tiles.push(['Dani igranja', new Set(filtered.map(s => s.day)).size, 'dana s rezultatom']);
      tiles.push(['Najbolji rezultat', timeBased.length ? fmt(Math.min(...timeBased.map(s => s.score))) : '–', 'svih igara']);
    } else {
      tiles.push(['Najbolji rezultat', timeBased.length ? fmt(Math.min(...timeBased.map(s => s.score))) : '–', '']);
      tiles.push(['Prosjek', timeBased.length ? fmt(totalSeconds / timeBased.length) : '–', 'po zagonetki']);
    }
    $('stats-totals').innerHTML = tiles.map(([label, val, sub]) => `<div class="totals-tile"><strong>${val}</strong><span>${label}${sub ? ' · ' + sub : ''}</span></div>`).join('');

    const games = [...new Set(all.map(s => s.game))].sort();
    const body = $('stats-body');
    if (!games.length) { body.innerHTML = '<div class="score-empty">Još nema riješenih zagonetki.</div>'; return; }
    const g = document.createElement('div'); g.className = 'score-group';
    g.innerHTML = '<h3>Po igri</h3>' + games.map(game => {
      const mine = filtered.filter(s => s.game === game);
      if (!mine.length) return `<div class="score-row"><span class="name">${esc(GAME_NAMES[game] || game)}<div class="sub">još ništa u ovom razdoblju</div></span></div>`;
      const sub = game === 'cesta'
        ? `odigrano ${mine.length} · najdalje ${Math.max(...mine.map(s => s.km))} km`
        : `riješeno ${mine.length} · najbolje ${fmt(Math.min(...mine.map(s => s.score)))}`;
      return `<div class="score-row"><span class="name">${esc(GAME_NAMES[game] || game)}<div class="sub">${sub}</div></span></div>`;
    }).join('');
    body.innerHTML = '';
    body.appendChild(g);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('#hub-tabs button')) b.onclick = () => switchTab(b.dataset.tab);
    for (const b of document.querySelectorAll('#stats-tabs button')) {
      b.onclick = () => { range = b.dataset.range; for (const x of document.querySelectorAll('#stats-tabs button')) x.classList.toggle('active', x === b); renderStats(); };
    }
    $('player').addEventListener('change', e => { Scores.setPlayer(e.target.value); renderStats(); });
  });
})();
