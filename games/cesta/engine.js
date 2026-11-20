// Picks the day's 8 questions (2 per theme, deterministic) and checks typed answers.
(function (global) {
  const GROUPS = ['hrvatska', 'svijet', 'priroda', 'zabava'];
  const GROUP_LABELS = { hrvatska: 'Hrvatska', svijet: 'Svijet', priroda: 'Priroda i znanost', zabava: 'Zabava i sport' };

  // Real road waypoints Vukovar → Dubrovnik, with their own (approximate) cumulative km.
  const ROUTE = [
    { name: 'Vukovar', km: 0 }, { name: 'Đakovo', km: 50 }, { name: 'Osijek', km: 90 },
    { name: 'Slavonski Brod', km: 160 }, { name: 'Zagreb', km: 260 }, { name: 'Karlovac', km: 300 },
    { name: 'Gospić', km: 380 }, { name: 'Zadar', km: 460 }, { name: 'Šibenik', km: 520 },
    { name: 'Split', km: 580 }, { name: 'Makarska', km: 650 }, { name: 'Ston', km: 760 },
    { name: 'Dubrovnik', km: 900 }
  ];
  const GOAL_KM = ROUTE[ROUTE.length - 1].km;

  // Days since a fixed epoch, used to pick a non-repeating rotation of questions.
  function dayIndex(day) {
    return Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  }

  function pickDaily(day) {
    const idx = dayIndex(day);
    const picked = [];
    for (const g of GROUPS) {
      const bank = window.CESTA_QUESTIONS[g];
      const i1 = (idx * 2) % bank.length;
      const i2 = (idx * 2 + 1) % bank.length;
      picked.push({ group: g, label: GROUP_LABELS[g], ...bank[i1] });
      if (i2 !== i1) picked.push({ group: g, label: GROUP_LABELS[g], ...bank[i2] });
      else picked.push({ group: g, label: GROUP_LABELS[g], ...bank[(i1 + 1) % bank.length] });
    }
    return picked;
  }

  function normalize(s) {
    return String(s).toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
      .replace(/\s+/g, ' ');
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
    return d[m][n];
  }

  // Accepts an exact match, or a close typo (allowing more slack on longer answers).
  function isCorrect(typed, accepted) {
    const t = normalize(typed);
    if (!t) return false;
    for (const ans of accepted) {
      const a = normalize(ans);
      if (t === a) return true;
      const tolerance = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
      if (levenshtein(t, a) <= tolerance) return true;
    }
    return false;
  }

  // Position along the route for a given km, for drawing progress.
  function positionOnRoute(km) {
    const clamped = Math.max(0, Math.min(GOAL_KM, km));
    for (let i = 1; i < ROUTE.length; i++) {
      if (clamped <= ROUTE[i].km) {
        const prev = ROUTE[i - 1];
        const frac = (clamped - prev.km) / (ROUTE[i].km - prev.km || 1);
        return { from: prev.name, to: ROUTE[i].name, frac, reached: ROUTE[i - 1] };
      }
    }
    return { from: ROUTE[ROUTE.length - 1].name, to: null, frac: 1, reached: ROUTE[ROUTE.length - 1] };
  }

  global.CestaEngine = { pickDaily, isCorrect, normalize, ROUTE, GOAL_KM, positionOnRoute, GROUP_LABELS };
})(window);
