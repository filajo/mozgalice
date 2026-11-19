// Shared score store for all games.
// Today: saved on this phone only (localStorage).
// Later: set Scores.remote (see config.js) so both phones share one leaderboard.
(function (global) {
  const KEY = 'mozgalice.scores';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const save = list => localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));

  const Scores = {
    remote: null, // { submit(score): Promise, list(filter): Promise<score[]> }

    getPlayer() { return localStorage.getItem('mozgalice.player') || ''; },
    setPlayer(name) { localStorage.setItem('mozgalice.player', name.trim().slice(0, 20)); },

    // score: { game, mode: 'daily'|'free', level, day: 'YYYY-MM-DD', seconds, mistakes, hints, points }
    async submit(score) {
      const entry = { ...score, player: Scores.getPlayer() || 'Igrač', at: new Date().toISOString() };
      const list = load(); list.push(entry); save(list);
      if (Scores.remote) { try { await Scores.remote.submit(entry); } catch (e) { console.warn('remote submit failed', e); } }
      return entry;
    },

    async list(filter = {}) {
      let list = load();
      if (Scores.remote) { try { list = await Scores.remote.list(filter); } catch (e) { console.warn('remote list failed', e); } }
      return list.filter(s => Object.entries(filter).every(([k, v]) => s[k] === v));
    },

    // Removes one submitted result (matched by game + player + its submission timestamp).
    async remove(entry) {
      const list = load().filter(e => !(e.game === entry.game && e.player === entry.player && e.at === entry.at));
      save(list);
      if (Scores.remote) { try { await Scores.remote.remove(entry); } catch (e) { console.warn('remote remove failed', e); } }
    }
  };
  global.Scores = Scores;
})(window);

// Small reusable confirm dialog. Expects the page to have:
// <div id="confirm" class="overlay" hidden><div class="dialog">
//   <p id="confirm-text"></p>
//   <button id="confirm-yes" class="big-btn primary">Da</button>
//   <button id="confirm-no" class="big-btn">Ne</button>
// </div></div>
window.UI = {
  confirm(text) {
    return new Promise(resolve => {
      const el = document.getElementById('confirm');
      if (!el) { resolve(window.confirm(text)); return; } // fallback if the markup is missing
      document.getElementById('confirm-text').textContent = text;
      el.hidden = false;
      const yes = document.getElementById('confirm-yes'), no = document.getElementById('confirm-no');
      const cleanup = () => { el.hidden = true; yes.onclick = null; no.onclick = null; };
      yes.onclick = () => { cleanup(); resolve(true); };
      no.onclick = () => { cleanup(); resolve(false); };
    });
  }
};

// Supabase adapter (plain REST, no SDK). Enabled when config.js has a URL and key.
(function () {
  const c = window.MOZGALICE_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseAnonKey) return;
  const base = c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/scores';
  // New publishable keys (sb_publishable_...) go only in the apikey header; legacy anon JWTs also as Bearer.
  const headers = { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' };
  if (c.supabaseAnonKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + c.supabaseAnonKey;
  const PENDING = 'mozgalice.pending';
  const pending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch (e) { return []; } };
  async function post(entry) {
    const r = await fetch(base, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(entry) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }
  async function flush() { // send scores saved while offline
    const list = pending(); const left = [];
    for (const e of list) { try { await post(e); } catch (err) { left.push(e); } }
    localStorage.setItem(PENDING, JSON.stringify(left));
  }
  window.Scores.remote = {
    async submit(entry) {
      try { await flush(); await post(entry); }
      catch (e) { localStorage.setItem(PENDING, JSON.stringify([...pending(), entry])); throw e; }
    },
    async list(filter) {
      await flush().catch(() => {});
      const q = Object.entries(filter).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${base}?select=*&order=score.asc&limit=1000${q ? '&' + q : ''}`, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
    async remove(entry) {
      const q = `game=eq.${encodeURIComponent(entry.game)}&player=eq.${encodeURIComponent(entry.player)}&at=eq.${encodeURIComponent(entry.at)}`;
      const r = await fetch(`${base}?${q}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    }
  };
})();
