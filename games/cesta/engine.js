// Picks the day's 8 questions (2 per theme, deterministic) and checks typed answers.
(function (global) {
  const GROUPS = ['hrvatska', 'svijet', 'priroda', 'zabava'];
  const GROUP_LABELS = { hrvatska: 'Hrvatska', svijet: 'Svijet', priroda: 'Priroda i znanost', zabava: 'Zabava i sport' };

  // Real road waypoints Vukovar → Dubrovnik, with their own (approximate) cumulative km,
  // and a stylized position on the map SVG's 320x340 viewBox (same points as its road path).
  const ROUTE = [
    { name: 'Vukovar', km: 0, map: { x: 285, y: 55 }, labelDy: 10 },
    { name: 'Đakovo', km: 50, map: { x: 250, y: 75 } },
    { name: 'Osijek', km: 90, map: { x: 260, y: 45 }, labelDy: -6 },
    { name: 'Slavonski Brod', km: 160, map: { x: 210, y: 90 } },
    { name: 'Zagreb', km: 260, map: { x: 120, y: 100 } },
    { name: 'Karlovac', km: 300, map: { x: 100, y: 130 } },
    { name: 'Gospić', km: 380, map: { x: 85, y: 170 } },
    { name: 'Zadar', km: 460, map: { x: 100, y: 215 } },
    { name: 'Šibenik', km: 520, map: { x: 108, y: 245 } },
    { name: 'Split', km: 580, map: { x: 118, y: 270 } },
    { name: 'Makarska', km: 650, map: { x: 128, y: 295 } },
    { name: 'Ston', km: 760, map: { x: 140, y: 320 } },
    { name: 'Dubrovnik', km: 900, map: { x: 148, y: 335 } }
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

  // Position along the route for a given km, for drawing progress (including a map x/y,
  // linearly interpolated between the two waypoints the traveller is currently between).
  function positionOnRoute(km) {
    const clamped = Math.max(0, Math.min(GOAL_KM, km));
    for (let i = 1; i < ROUTE.length; i++) {
      if (clamped <= ROUTE[i].km) {
        const prev = ROUTE[i - 1], next = ROUTE[i];
        const frac = (clamped - prev.km) / (next.km - prev.km || 1);
        const mapX = prev.map.x + (next.map.x - prev.map.x) * frac;
        const mapY = prev.map.y + (next.map.y - prev.map.y) * frac;
        return { from: prev.name, to: next.name, frac, reached: prev, mapX, mapY };
      }
    }
    const last = ROUTE[ROUTE.length - 1];
    return { from: last.name, to: null, frac: 1, reached: last, mapX: last.map.x, mapY: last.map.y };
  }

  global.CestaEngine = { pickDaily, isCorrect, normalize, ROUTE, GOAL_KM, positionOnRoute, GROUP_LABELS };
})(window);
