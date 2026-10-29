import { HOUR, addDays, dayKey, fmtAgo, fmtDur, fmtHours, sumAll, sumRange, total } from './lib/core.js';
import { daysUntil, seasonAt, seasonProgress, upcomingDeadlines } from './lib/calendar.js';
import { allGames } from './lib/games.js';
import { applyTheme, capsule, el, fill, fmtCountdown, loadAll, paintAvatar, profileFor, updateAvailable, withLive } from './lib/view.js';

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
  const upd = updateAvailable(state.updateStatus);
  $('update').hidden = !upd;
  if (upd) $('update').textContent = `⬇️ Hay una versión nueva (${state.updateStatus.published}). Descargar →`;

  const { profile, lv } = profileFor(state, data);
  applyTheme(profile.theme);
  paintAvatar($('avatar'), profile, lv.level, !!live);
  $('name').textContent = profile.name;
  $('title').textContent = profile.titleText;
  fill($('status'), 
    live ? el('span', { class: 'status-playing' }, `Jugando a ${live.name}`) : el('span', { class: 'status-online' }, `Nivel ${lv.level} · ${fmtHours(total(two))} en las últimas 2 semanas`),
  );
  $('xp').style.width = `${Math.round(lv.progress * 100)}%`;
  $('xp-label').textContent = lv.nextTitle ? `Faltan ${fmtHours(lv.hoursToNext * HOUR)} para ${lv.nextTitle}` : 'Rango máximo. Hacienda te debe una placa.';
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
    $('season-sub').textContent = `Acaba ${fmtCountdown(daysUntil(season.end, new Date(now)))}`;
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
chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {}).finally(() => refresh().then(showFresh));
setInterval(() => state && render(), 1000);
setInterval(refresh, 15000);
