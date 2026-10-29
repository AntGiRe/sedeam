// Service worker: decide en cada momento si se está "jugando" y apunta el tiempo.
//
// Se cuenta tiempo solo si se cumplen las tres cosas a la vez:
//   1. la pestaña activa es de un juego (una web del catálogo o añadida por el usuario),
//   2. la ventana de Chrome tiene el foco,
//   3. el usuario no lleva más de N minutos sin tocar ratón/teclado.

import { MIN, commitSegment, uncommitSegment, dayKey, fmtBadge, fmtDur, levelFor, total, sumAll } from './lib/core.js';
import { evaluate } from './lib/rules.js';
import { enabledGames, matchGame } from './lib/games.js';
import { getCatalog, refreshRemoteCatalog } from './lib/catalog.js';
import { checkForUpdates } from './lib/updates.js';
import { loadData, saveData, loadSettings } from './lib/store.js';
import { BRAND } from './config.js';

const TICK = 'tick';
const UPDATES = 'updates';
// Si entre dos apuntes pasa más que esto, el ordenador estuvo dormido: no se regala ese hueco.
const MAX_GAP = 2.5 * MIN;

let queue = Promise.resolve();
function serial(fn) {
  queue = queue.then(fn).catch((e) => console.error(`[${BRAND.name}]`, e));
  return queue;
}

async function currentGame(catalog, settings, idleState) {
  const state = idleState || (await chrome.idle.queryState(settings.idleMinutes * 60));
  if (state !== 'active') return null;
  let win;
  try {
    win = await chrome.windows.getLastFocused();
  } catch {
    return null;
  }
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.url) return null;
  return matchGame(tab.url, enabledGames(catalog, settings));
}

function tick(reason, idleState) {
  return serial(async () => {
    const now = Date.now();
    const [settings, catalog, data] = await Promise.all([loadSettings(), getCatalog(), loadData()]);
    const idleMs = settings.idleMinutes * MIN;
    const { live, recent = [] } = await chrome.storage.session.get(['live', 'recent']);
    const levelBefore = levelFor(total(sumAll(data)), catalog.levels).level;

    // Tramos recientes: hacen falta para descontar el rato sin actividad cuando salta el aviso de inactividad.
    let segs = recent.filter((s) => s.end > now - idleMs - 2 * MIN);
    let changed = false;

    if (live) {
      const end = now - live.start > MAX_GAP ? live.start + MIN : now;
      if (end > live.start) {
        commitSegment(data, live.game, live.start, end);
        segs.push({ game: live.game, start: live.start, end });
        changed = true;
      }
    }

    if (reason === 'idle') {
      const cut = now - idleMs;
      for (const s of segs) {
        const from = Math.max(s.start, cut);
        if (s.end > from) {
          uncommitSegment(data, s.game, from, s.end);
          s.end = from;
          changed = true;
        }
      }
      segs = segs.filter((s) => s.end > s.start);
    }

    const game = await currentGame(catalog, settings, idleState);

    // También se evalúa sin cambios de tiempo: un catálogo nuevo puede traer logros que ya se cumplen.
    const fresh = evaluate(data, catalog.achievements, now);
    if (changed || fresh.length) {
      await saveData(data);
      if (settings.notifications) {
        for (const a of fresh) notify(`logro-${a.id}`, `🏆 Logro desbloqueado: ${a.name}`, `${a.emoji} ${a.desc}`);
        const lv = levelFor(total(sumAll(data)), catalog.levels);
        if (lv.level > levelBefore) notify(`nivel-${lv.level}`, `⬆️ ¡Subes a nivel ${lv.level}!`, `Nuevo rango: ${lv.title}`);
      }
    }

    await chrome.storage.session.set({ live: game ? { game: game.id, start: now } : null, recent: segs });
    await updateBadge(data, game);
  });
}

async function updateBadge(data, game) {
  if (!game) {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: BRAND.name });
    return;
  }
  const today = data.days[dayKey(Date.now())]?.[game.id] || 0;
  await chrome.action.setBadgeBackgroundColor({ color: game.color });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: fmtBadge(today) });
  await chrome.action.setTitle({ title: `${BRAND.name} · Jugando a ${game.name} · hoy ${fmtDur(today)}` });
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    priority: 0,
  });
}

// Catálogo nuevo en GitHub y/o versión nueva del código en disco.
async function runUpdates() {
  try {
    if (await refreshRemoteCatalog()) {
      const c = await getCatalog();
      notify('catalogo', `${BRAND.name}: catálogo actualizado`, `Ahora hay ${c.games.length} juegos y ${c.achievements.length} logros.`);
      tick('catalog');
    }
  } catch (e) {
    console.warn(`[${BRAND.name}] catálogo`, e.message);
  }
  const { reload } = await checkForUpdates();
  if (reload) {
    await tick('before-reload'); // apunta lo que lleve la sesión antes de recargar
    chrome.runtime.reload();
  }
}

async function applyIdleInterval() {
  const settings = await loadSettings();
  // El intervalo no sobrevive a que el service worker se duerma: se fija cada vez que arranca.
  chrome.idle.setDetectionInterval(Math.max(15, settings.idleMinutes * 60));
}

async function setup() {
  await applyIdleInterval();
  if (!(await chrome.alarms.get(TICK))) await chrome.alarms.create(TICK, { periodInMinutes: 1 });
  if (!(await chrome.alarms.get(UPDATES))) await chrome.alarms.create(UPDATES, { periodInMinutes: 60, delayInMinutes: 1 });
  tick('startup');
}

applyIdleInterval();

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await setup();
  if (reason === 'update' && previousVersion !== chrome.runtime.getManifest().version) {
    notify('actualizado', `${BRAND.name} se ha actualizado`, `Versión ${chrome.runtime.getManifest().version}. Tus horas y logros siguen intactos.`);
  }
  runUpdates();
});
chrome.runtime.onStartup.addListener(() => setup().then(runUpdates));

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === TICK) tick('alarm');
  if (a.name === UPDATES) runUpdates();
});
chrome.tabs.onActivated.addListener(() => tick('tab'));
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.status === 'complete')) tick('url');
});
chrome.tabs.onRemoved.addListener(() => tick('tab'));
chrome.windows.onFocusChanged.addListener(() => tick('focus'));
chrome.idle.onStateChanged.addListener((state) => tick(state === 'idle' ? 'idle' : state, state));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) setup();
});

chrome.notifications.onClicked.addListener((id) => {
  const hash = id.startsWith('logro') ? '#logros' : id.startsWith('nivel') ? '#estadisticas' : '#biblioteca';
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html' + hash) });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // El popup pide un apunte al abrirse para enseñar cifras al segundo.
  if (msg?.type === 'flush') {
    tick('flush').then(() => reply(true));
    return true;
  }
  if (msg?.type === 'check-updates') {
    runUpdates().then(() => reply(true));
    return true;
  }
});
