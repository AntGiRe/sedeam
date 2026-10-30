import { addDays, dayKey, fmtAgo, fmtDur, fmtHours, sumAll, sumRange, total } from './lib/core.js';
import { daysUntil, seasonAt, seasonProgress, upcomingDeadlines } from './lib/calendar.js';
import { allGames } from './lib/games.js';
import { fmtXp } from './lib/xp.js';
import { LOADING } from './lib/extras.js';
import { applyTheme, capsule, el, fill, fmtCountdown, loadAll, paintAvatar, profileFor, shortcutsOf, updateAvailable, withLive } from './lib/view.js';
import { challengeState, pickChallenges, weekOf } from './lib/challenges.js';
import { matchGame } from './lib/games.js';
import { saveSettings } from './lib/store.js';
import { featuredYear, latestPeriods, parsePeriod } from './lib/wrapped.js';

const $ = (id) => document.getElementById(id);
let state = null;

function render() {
  const now = Date.now();
  const { catalog, settings } = state;
  const data = withLive(state.data, state.live, now);
  const games = allGames(catalog, settings);
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));

  const all = sumAll(data);
  const today = dayKey(now);
  const two = sumRange(data, dayKey(addDays(now, -13)), today);
  const grand = total(all);
  const live = state.live && byId[state.live.game];

  $('ver').textContent = `v${chrome.runtime.getManifest().version}`;
  // Nube: solo si hay cuenta (sin cuenta no se insiste).
  $('cloud').hidden = !state.account;
  if (state.account) {
    const st = state.cloud?.status;
    $('cloud').classList.toggle('err', !!st?.error);
    $('cloud').textContent = st?.error ? 'Sin sincronizar' : `Nube · ${Math.max(1, (state.cloud?.devices || []).length)} PC${(state.cloud?.devices || []).length > 1 ? 's' : ''}`;
    $('cloud').title = st?.error ? `No se ha podido sincronizar: ${st.error}` : st?.at ? `Sincronizado a las ${new Date(st.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Sincronizando…';
  }
  // El Wrapped del año (desde la segunda semana de diciembre hasta enero) y, los 7 primeros días de
  // cada mes, el del mes anterior.
  const nowD = new Date(now);
  const wp = latestPeriods(nowD)
    .filter((id) => id === featuredYear(nowD) || nowD.getDate() <= 7)
    .find((id) => Object.keys(data.days).some((k) => k.startsWith(id)));
  $('wrapped-link').hidden = !wp;
  if (wp) {
    $('wrapped-link').href = `wrapped.html?periodo=${wp}`;
    $('wrapped-link').textContent = wp.length === 4 ? `🎁 Tu ${wp} en Sedeam ya está aquí. Dale al play →` : `🎁 Tu Wrapped de ${parsePeriod(wp).name} está listo →`;
  }
  const upd = updateAvailable(state.updateStatus);
  $('update').hidden = !upd;
  if (upd) $('update').textContent = `⬇️ Hay una versión nueva (${state.updateStatus.published}). Descargar →`;

  const { profile, lv } = profileFor(state, data);
  applyTheme(profile.theme);
  paintAvatar($('avatar'), profile, lv.level, !!live);
  $('name').textContent = profile.name;
  $('title').textContent = profile.titleText;
  fill($('status'), 
    live ? el('span', { class: 'status-playing' }, `Jugando a ${live.name}`) :
    state.live?.game === LOADING ? el('span', { class: 'muted' }, '⏳ En pantalla de carga (identificándote)…') : el('span', { class: 'status-online' }, `Nivel ${lv.level} · ${fmtHours(total(two))} en las últimas 2 semanas`),
  );
  $('xp').style.width = `${Math.round(lv.progress * 100)}%`;
  $('xp-label').textContent = lv.nextTitle ? `${fmtXp(lv.xpInLevel)} / ${fmtXp(lv.xpForLevel)} · siguiente: ${lv.nextTitle}` : `${fmtXp(lv.xp)} · rango máximo`;
  $('total').textContent = `${fmtHours(grand)} en total`;

  $('now').hidden = !live;
  if (live) {
    $('now').style.setProperty('--game', live.color);
    fill($('now-art'), capsule(live, { mini: true, style: 'width:40px' }));
    $('now-name').textContent = live.name;
    const run = data.run && data.run.game === live.id ? data.run.ms : 0;
    $('now-session').textContent = fmtDur(run);
  }

  // Temporada en curso y próximo plazo.
  if (catalog.seasons) {
    const season = seasonAt(catalog.seasons, new Date(now));
    const sp = seasonProgress(data, catalog.seasons, season);
    $('season').style.setProperty('--season', season.color);
    $('season-name').textContent = `${season.emoji} ${season.label}`;
    $('season-tier').textContent = `Nv. ${sp.tier}/${catalog.seasons.tiers}`;
    $('season-bar').style.width = `${Math.round(sp.progress * 100)}%`;
    const week = weekOf(new Date(now));
    const chs = pickChallenges(catalog.challenges || [], week.id);
    const done = chs.filter((c) => challengeState(c, data, week, new Date(now))?.done).length;
    $('season-sub').textContent = sp.maxed ? '¡Pase completado!' : `${sp.xpInTier}/${sp.xpPerTier} XP${chs.length ? ` · retos ${done}/${chs.length}` : ''}`;
  }
  const next = upcomingDeadlines(catalog.deadlines, new Date(now), { limit: 1 })[0];
  $('deadline').hidden = !next;
  if (next) {
    const d = daysUntil(next.date, new Date(now));
    $('deadline').classList.toggle('soon', d <= 3);
    $('deadline-when').textContent = fmtCountdown(d);
    $('deadline-title').textContent = next.title;
    $('deadline-sub').textContent = `${next.date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}${next.models ? ` · ${next.models}` : ''}`;
  }

  // Como en cualquier biblioteca: primero lo jugado más recientemente.
  const sorted = games
    .filter((g) => g.enabled || all[g.id])
    .sort((a, b) => (data.lastPlayed[b.id] || 0) - (data.lastPlayed[a.id] || 0) || (all[b.id] || 0) - (all[a.id] || 0));
  fill($('games'), 
    ...sorted.map((g) => {
      const ms = all[g.id] || 0;
      const isLive = live && live.id === g.id;
      return el(
        'li',
        { class: ms ? '' : 'unplayed', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html#biblioteca/${g.id}`) }) },
        capsule(g, { mini: true }),
        el(
          'div',
          { class: 'g-main' },
          el('div', { class: 'g-name' }, g.name, isLive ? el('span', { class: 'playing-dot', title: 'Jugando ahora' }) : null),
          el('div', { class: 'g-sub' }, ms ? `Última sesión: ${fmtAgo(isLive ? now : data.lastPlayed[g.id], now)}` : 'Sin jugar todavía'),
        ),
        el('div', { class: 'g-hours' }, el('b', {}, ms ? fmtHours(ms) : '—'), ms ? el('span', {}, `${fmtHours(two[g.id] || 0)} 2 sem.`) : null),
      );
    }),
  );

  const achievements = catalog.achievements;
  const unlocked = Object.entries(data.achievements).filter(([id]) => achievements.some((a) => a.id === id)).sort((a, b) => b[1] - a[1]);
  const lastA = unlocked.length && achievements.find((a) => a.id === unlocked[0][0]);
  fill($('last'), 
    lastA ? el('span', { class: 'ico', 'aria-hidden': 'true' }, lastA.emoji) : null,
    el('div', { style: 'min-width:0' }, el('span', { class: 'muted' }, `Logros ${unlocked.length}/${achievements.length}`), lastA ? el('b', {}, lastA.name) : el('b', { class: 'secondary' }, 'Entra en una sede para empezar')),
  );
}

async function refresh() {
  state = await loadAll();
  render();
}

// ---------- Lanzador ----------

let activeTab = null;

function renderLauncher() {
  const list = shortcutsOf(state);
  fill(
    $('launcher'),
    list.length
      ? list.map((sc) =>
          el(
            'button',
            {
              title: sc.url,
              onclick: () => {
                chrome.tabs.create({ url: sc.url });
                window.close();
              },
            },
            el('span', { 'aria-hidden': 'true' }, sc.emoji || '🔗'),
            el('span', { class: 'n' }, sc.name),
          ),
        )
      : el('div', { class: 'empty' }, 'Sin accesos directos. Abre un trámite y pulsa «＋ Esta página».'),
  );
  const url = activeTab?.url || '';
  $('add-page').hidden = !/^https:\/\//.test(url) || list.some((sc) => sc.url === url);
}

async function addShortcut(name) {
  const list = [...shortcutsOf(state)];
  const game = matchGame(activeTab.url, state.catalog.games);
  list.push({ id: `sc-${Date.now().toString(36)}`, name: name.trim().slice(0, 28), url: activeTab.url, emoji: game?.emoji || '⭐' });
  state.settings = { ...state.settings, shortcuts: list };
  await saveSettings(state.settings);
  renderLauncher();
}

$('add-page').addEventListener('click', () => {
  $('add-form').hidden = false;
  $('add-name').value = (activeTab.title || 'Trámite').replace(/\s*[-|–·].*$/, '').slice(0, 28);
  $('add-name').select();
});
$('add-cancel').addEventListener('click', () => ($('add-form').hidden = true));
$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('add-name').value.trim()) return;
  await addShortcut($('add-name').value);
  $('add-form').hidden = true;
});

// Logros desbloqueados desde la última vez que miraste: se enseñan aquí una vez y se dan por vistos.
async function showFresh() {
  const [{ unseen = [] }, { catalog }] = await Promise.all([chrome.storage.local.get('unseen'), state ? Promise.resolve(state) : loadAll()]);
  const list = unseen.map((id) => catalog.achievements.find((a) => a.id === id)).filter(Boolean).slice(-3).reverse();
  $('fresh').hidden = !list.length;
  fill($('fresh'), 
    ...list.map((a) =>
      el('a', { href: 'app.html#logros', target: '_blank' }, el('span', { class: 'ico', 'aria-hidden': 'true' }, a.emoji), el('div', { style: 'min-width:0' }, el('div', { class: 'k' }, '🏆 Logro desbloqueado'), el('b', {}, a.name))),
    ),
  );
  if (unseen.length) chrome.storage.local.set({ unseen: [] });
}

// Pide un apunte al service worker para que las cifras estén al día y luego refresca cada segundo.
chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
  activeTab = t || null;
  if (state) renderLauncher();
});
chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {}).finally(() => refresh().then(() => {
  renderLauncher();
  showFresh();
}));
setInterval(() => state && render(), 1000);
setInterval(refresh, 15000);
