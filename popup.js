import { HOUR, addDays, dayKey, fmtAgo, fmtDur, fmtHours, levelFor, sumAll, sumRange, total } from './lib/core.js';
import { allGames } from './lib/games.js';
import { capsule, el, levelColor, loadAll, updateAvailable, withLive } from './lib/view.js';

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
  if (upd) $('update').textContent = `⬇️ Hay una versión nueva (${state.updateStatus.published}). Ver cómo actualizar →`;

  const lv = levelFor(grand, catalog.levels);
  $('lvl').textContent = lv.level;
  $('avatar').style.setProperty('--lvl', levelColor(lv.level));
  $('avatar').classList.toggle('playing', !!live);
  $('title').textContent = lv.title;
  $('status').replaceChildren(
    live ? el('span', { class: 'status-playing' }, `Jugando a ${live.name}`) : el('span', { class: 'status-online' }, `Nivel ${lv.level} · ${fmtHours(total(two))} en las últimas 2 semanas`),
  );
  $('xp').style.width = `${Math.round(lv.progress * 100)}%`;
  $('xp-label').textContent = lv.nextTitle ? `Faltan ${fmtHours(lv.hoursToNext * HOUR)} para ${lv.nextTitle}` : 'Rango máximo. Hacienda te debe una placa.';
  $('total').textContent = `${fmtHours(grand)} en total`;

  $('now').hidden = !live;
  if (live) {
    $('now').style.setProperty('--game', live.color);
    $('now-art').replaceChildren(capsule(live, { mini: true, style: 'width:40px' }));
    $('now-name').textContent = live.name;
    const run = data.run && data.run.game === live.id ? data.run.ms : 0;
    $('now-session').textContent = fmtDur(run);
  }

  // Como en cualquier biblioteca: primero lo jugado más recientemente.
  const sorted = games
    .filter((g) => g.enabled || all[g.id])
    .sort((a, b) => (data.lastPlayed[b.id] || 0) - (data.lastPlayed[a.id] || 0) || (all[b.id] || 0) - (all[a.id] || 0));
  $('games').replaceChildren(
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
  $('last').replaceChildren(
    lastA ? el('span', { class: 'ico', 'aria-hidden': 'true' }, lastA.emoji) : null,
    el('div', { style: 'min-width:0' }, el('span', { class: 'muted' }, `Logros ${unlocked.length}/${achievements.length}`), lastA ? el('b', {}, lastA.name) : el('b', { class: 'secondary' }, 'Entra en una sede para empezar')),
  );
}

async function refresh() {
  state = await loadAll();
  render();
}

// Pide un apunte al service worker para que las cifras estén al día y luego refresca cada segundo.
chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {}).finally(refresh);
setInterval(() => state && render(), 1000);
setInterval(refresh, 15000);
