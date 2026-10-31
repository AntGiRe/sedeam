// Service worker: decide en cada momento si se está "jugando" y apunta el tiempo.
//
// Se cuenta tiempo solo si se cumplen las tres cosas a la vez:
//   1. la pestaña activa es de un juego (una web del catálogo o añadida por el usuario),
//   2. la ventana de Chrome tiene el foco,
//   3. el usuario no lleva más de N minutos sin tocar ratón/teclado.

import { MIN, commitSegment, uncommitSegment, dayKey, dayTotal, fmtBadge, fmtDur } from './lib/core.js';
import { XP_DROP_EVERY, dropsCrossed, fmtXp, grantDailyBonus, levelOf, msToXp } from './lib/xp.js';
import { evaluate } from './lib/rules.js';
import { resolveChallenges } from './lib/challenges.js';
import { featuredYear, latestPeriods, parsePeriod } from './lib/wrapped.js';
import { daysUntil, seasonAt, seasonProgress, upcomingDeadlines } from './lib/calendar.js';
import { rewardContext, unlockedIds } from './lib/rewards.js';
import { enabledGames, matchGame } from './lib/games.js';
import { getCatalog, refreshRemoteCatalog } from './lib/catalog.js';
import { checkForUpdates } from './lib/updates.js';
import { loadData, saveData, loadSettings, saveSettings } from './lib/store.js';
import { showToasts } from './lib/toast.js';
import { LOADING, addLoading, isLoadingUrl, outageKind, outageTarget, recordOutage, recordTabs } from './lib/extras.js';
import { BRAND, CLOUD_ENABLED } from './config.js';
import { applyPulled, buildUploads, emptyCloud, mergeData, prefsOf, profileAction, syncSig, SYNCED_PREFS } from './lib/cloud-core.js';
import { api, getSession, selectAll, upsert } from './lib/cloud.js';

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
  const game = matchGame(tab.url, enabledGames(catalog, settings));
  if (game) return game;
  // No es un juego, pero ¿es una pantalla de carga (identificándote con Cl@ve)?
  return isLoadingUrl(tab.url, catalog.loading) ? { id: LOADING, loading: true, name: catalog.loading.name } : null;
}

// Pestañas abiertas ahora mismo de cada sede, para los récords de malabarista.
async function tabCounts(catalog, settings) {
  const games = enabledGames(catalog, settings);
  const counts = {};
  for (const t of await chrome.tabs.query({})) {
    const g = t.url && matchGame(t.url, games);
    if (g) counts[g.id] = (counts[g.id] || 0) + 1;
  }
  return counts;
}

// Las pantallas de carga se apuntan aparte: no suben nivel ni temporada.
function commitAny(data, game, start, end) {
  if (game === LOADING) addLoading(data, start, end, 1);
  else commitSegment(data, game, start, end);
}

function uncommitAny(data, game, start, end) {
  if (game === LOADING) addLoading(data, start, end, -1);
  else uncommitSegment(data, game, start, end);
}

function tick(reason, idleState) {
  return serial(async () => {
    const now = Date.now();
    const [settings, catalog, data, { cloud }] = await Promise.all([loadSettings(), getCatalog(), loadData(), chrome.storage.local.get('cloud')]);
    // Lo que cuenta para niveles, temporada y logros es la suma de todos tus PCs (si hay cuenta).
    const all = () => mergeData(data, cloud);
    const idleMs = settings.idleMinutes * MIN;
    const { live, recent = [] } = await chrome.storage.session.get(['live', 'recent']);
    const before = all();
    const levelBefore = levelOf(before, catalog.levels).level;
    const todayBefore = dayTotal(data, dayKey(now));
    const xpItems = [];
    const rewardsBefore = unlockedIds(catalog, rewardContext(before, catalog));
    const season = catalog.seasons ? seasonAt(catalog.seasons, new Date(now)) : null;
    const tierBefore = season ? seasonProgress(before, catalog.seasons, season).tier : 0;

    // Tramos recientes: hacen falta para descontar el rato sin actividad cuando salta el aviso de inactividad.
    let segs = recent.filter((s) => s.end > now - idleMs - 2 * MIN);
    let changed = false;

    if (live) {
      const end = now - live.start > MAX_GAP ? live.start + MIN : now;
      if (end > live.start) {
        commitAny(data, live.game, live.start, end);
        segs.push({ game: live.game, start: live.start, end });
        changed = true;
        if (live.game !== LOADING && grantDailyBonus(data, now)) {
          xpItems.push({ kind: 'xp', emoji: '☀️', label: '+10 XP', name: 'Primer fichaje del día', desc: '¡Buenos días! Bonus por entrar en la sede.' });
        }
      }
    }

    if (reason === 'idle') {
      const cut = now - idleMs;
      for (const s of segs) {
        const from = Math.max(s.start, cut);
        if (s.end > from) {
          uncommitAny(data, s.game, from, s.end);
          s.end = from;
          changed = true;
        }
      }
      segs = segs.filter((s) => s.end > s.start);
    }

    const game = await currentGame(catalog, settings, idleState);
    if (recordTabs(data, await tabCounts(catalog, settings), now)) changed = true;

    // Retos antes que logros: completar un reto puede desbloquear un logro en el mismo apunte.
    let view = all();
    const doneChallenges = resolveChallenges(view, catalog.challenges || [], new Date(now), catalog.challengeWeeks);
    // También se evalúa sin cambios de tiempo: un catálogo nuevo puede traer logros que ya se cumplen.
    const fresh = evaluate(view, catalog.achievements, now);
    const pause = await checkBreak(game, settings, now);
    if (changed || fresh.length || doneChallenges.length) {
      await saveData(data);
      const items = doneChallenges.map((c) => ({ id: `reto-${c.week.id}-${c.id}`, kind: 'reward', emoji: c.emoji, label: '¡Reto semanal completado!', name: c.name, desc: `+${fmtXp(c.xp * 60)}` }));
      items.push(...fresh.map((a) => ({ id: `logro-${a.id}`, kind: 'ach', emoji: a.emoji, label: '¡Logro desbloqueado!', name: a.name, desc: a.desc })));
      view = all();
      const lv = levelOf(view, catalog.levels);
      if (lv.level > levelBefore) items.push({ id: `nivel-${lv.level}`, kind: 'level', emoji: '⬆️', label: `¡Nivel ${lv.level}!`, name: lv.title, desc: 'Has subido de rango. Sigue así (o no).' });
      if (season) {
        const tier = seasonProgress(view, catalog.seasons, season).tier;
        if (tier > tierBefore) items.push({ id: `temporada-${season.id}-${tier}`, kind: 'level', emoji: season.emoji, label: `Temporada ${season.label} · nivel ${tier}`, name: tier >= catalog.seasons.tiers ? '¡Pase completado!' : `Nivel ${tier} de ${catalog.seasons.tiers}`, desc: season.name });
      }
      const rewardsAfter = unlockedIds(catalog, rewardContext(view, catalog));
      for (const r of catalog.rewards || []) {
        if (rewardsAfter.has(r.id) && !rewardsBefore.has(r.id)) {
          items.push({ id: `recompensa-${r.id}`, kind: 'reward', emoji: r.type === 'avatar' ? r.emoji : { theme: '🎨', frame: '🖼️', title: '🏷️' }[r.type], label: '¡Recompensa desbloqueada!', name: r.name, desc: 'Equípala en tu Perfil.' });
        }
      }
      if (fresh.length) {
        const { unseen = [] } = await chrome.storage.local.get('unseen');
        await chrome.storage.local.set({ unseen: [...new Set([...unseen, ...fresh.map((a) => a.id)])] });
      }
      await announce(items, settings);
    }

    if (pause) await announce([pause], { ...settings, notifications: true });

    // Píldoras de XP: cada 15 minutos jugados hoy, una pequeña recompensa en la propia sede.
    const drops = dropsCrossed(todayBefore, dayTotal(data, dayKey(now)));
    if (drops && live && live.game !== LOADING) {
      const todayMs = dayTotal(data, dayKey(now));
      const hourHit = Math.floor(todayMs / (60 * MIN)) > Math.floor(todayBefore / (60 * MIN));
      const sp = season ? seasonProgress(all(), catalog.seasons, season) : null;
      const gameName = enabledGames(catalog, settings).find((g) => g.id === live.game)?.name || '';
      xpItems.push({
        kind: 'xp',
        emoji: hourHit ? '🔥' : '⚡',
        label: `+${msToXp(XP_DROP_EVERY) * drops} XP`,
        name: hourHit ? `${Math.floor(todayMs / (60 * MIN))} h hoy en sedes` : gameName,
        desc: sp ? (sp.maxed ? 'Pase de temporada completado' : `Temporada: nivel ${sp.tier} · ${sp.xpInTier}/${sp.xpPerTier} XP`) : '',
        progress: sp ? sp.xpInTier / sp.xpPerTier : null,
      });
    }
    if (xpItems.length && settings.xpToasts) await toastInActiveTab(xpItems, { ...settings, sound: false });

    await chrome.storage.session.set({ live: game ? { game: game.id, start: now } : null, recent: segs });
    await updateBadge(data, game);
  });
}

// ---------- Pausa activa ----------
// Cuenta el rato seguido en sedes (pausas de menos de 5 minutos no lo cortan) y avisa cada N minutos.

const BREAK_TIPS = [
  'Levántate, estira la espalda y mira a lo lejos 20 segundos. El 303 seguirá ahí.',
  'Bebe agua. Hacienda no te va a recordar que te hidrates.',
  'Rueda los hombros hacia atrás diez veces. Tu contractura te lo agradecerá.',
  'Da una vuelta hasta la cafetera. Es por tu salud, no por el café.',
  'Cierra los ojos un minuto. Si al abrirlos la sede sigue cargando, has ganado tiempo.',
  'Estira las muñecas: tantos clics en «Siguiente» no son normales.',
];

async function checkBreak(game, settings, now) {
  const { focus } = await chrome.storage.session.get('focus');
  let f = focus && now - focus.last <= 5 * MIN ? focus : null;
  if (!game) {
    await chrome.storage.session.set({ focus: f });
    return null;
  }
  if (!f) f = { start: now, last: now, reminded: 0 };
  f.last = now;
  let item = null;
  const every = settings.breakMinutes * MIN;
  if (settings.breakReminder && now - f.start >= every * (f.reminded + 1)) {
    f.reminded++;
    item = {
      id: `pausa-${now}`,
      kind: 'info',
      emoji: '🧘',
      label: 'Pausa activa',
      name: `Llevas ${fmtDur(now - f.start)} seguidos en sedes`,
      desc: BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)],
    };
  }
  await chrome.storage.session.set({ focus: f });
  return item;
}

async function updateBadge(data, game) {
  if (game?.loading) {
    await chrome.action.setBadgeBackgroundColor({ color: '#73849a' });
    await chrome.action.setBadgeText({ text: '⏳' });
    await chrome.action.setTitle({ title: `${BRAND.name} · En pantalla de carga (identificándote)` });
    return;
  }
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

// Avisa como en los juegos: tarjeta dentro de la página que tienes delante. Si eso no es posible
// (pestaña sin permiso, chrome://…), cae a la notificación del sistema.
async function announce(items, settings) {
  if (!items.length || !settings.notifications) return;
  // Las páginas propias abiertas (biblioteca) lo pintan ellas mismas al ver este cambio.
  await chrome.storage.local.set({ lastToast: { items, at: Date.now() } });
  const where = settings.toastInPage ? await toastInActiveTab(items, settings) : 'none';
  if (where === 'none' && settings.systemNotifications) {
    for (const it of items) notify(it.id, `${it.emoji} ${it.label}`, `${it.name} — ${it.desc}`);
  }
}

async function toastInActiveTab(items, settings) {
  let win;
  try {
    win = await chrome.windows.getLastFocused();
  } catch {
    return 'none';
  }
  if (!win?.focused) return 'none';
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.id) return 'none';
  if (tab.url?.startsWith(chrome.runtime.getURL(''))) return 'own-page';
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showToasts, args: [items, { sound: settings.sound, brand: BRAND.name }] });
    return 'page';
  } catch {
    return 'none';
  }
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

// Recordatorios de plazos: N días antes, la víspera y el mismo día, a partir de las 9:00.
async function checkDeadlines() {
  const [settings, catalog] = await Promise.all([loadSettings(), getCatalog()]);
  const now = new Date();
  if (!settings.deadlineAlerts || now.getHours() < 9) return;
  const marks = new Set([settings.deadlineDays, 1, 0]);
  const { deadlineSeen = [] } = await chrome.storage.local.get('deadlineSeen');
  const seen = new Set(deadlineSeen);
  const items = [];
  for (const d of upcomingDeadlines(catalog.deadlines, now, { limit: 20, horizon: settings.deadlineDays + 1 })) {
    const days = daysUntil(d.date, now);
    const key = `${d.key}:${days}`;
    if (!marks.has(days) || seen.has(key)) continue;
    seen.add(key);
    const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
    items.push({ id: `plazo-${key}`, kind: 'info', emoji: '📅', label: `Plazo ${when}`, name: d.title, desc: [d.models, d.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })].filter(Boolean).join(' · ') });
  }
  await chrome.storage.local.set({ deadlineSeen: [...seen].slice(-200) });
  if (items.length) await announce(items, settings);
}

// Desde las 9:00: aviso del Wrapped del año (a partir de la segunda semana de diciembre) y, la primera
// semana de cada mes, del Wrapped del mes pasado. Cada uno, una sola vez.
async function checkWrapped() {
  const now = new Date();
  if (now.getHours() < 9) return;
  const [settings, data, { wrappedSeen = [] }] = await Promise.all([loadSettings(), loadData(), chrome.storage.local.get('wrappedSeen')]);
  const items = [];
  for (const id of latestPeriods(now)) {
    if (id !== featuredYear(now) && now.getDate() > 7) continue;
    if (wrappedSeen.includes(id) || !Object.keys(data.days).some((k) => k.startsWith(id))) continue;
    const p = parsePeriod(id);
    wrappedSeen.push(id);
    items.push(p.kind === 'year'
      ? { id: `wrapped-${id}`, kind: 'reward', emoji: '🎁', label: `¡Llegó el ${BRAND.name} Wrapped ${p.name}!`, name: `Tu ${p.name} en la sede, en un par de minutos`, desc: 'Con música, tus 4 temporadas, tu aura fiscal y tarjeta para compartir.' }
      : { id: `wrapped-${id}`, kind: 'reward', emoji: '🎁', label: 'Tu Wrapped está listo', name: `Tu ${p.name} en ${BRAND.name}`, desc: 'Ábrelo desde el popup o en Estadísticas. Trae tarjeta para compartir.' });
  }
  if (!items.length) return;
  await chrome.storage.local.set({ wrappedSeen: wrappedSeen.slice(-40) });
  await announce(items, settings);
}

// Catálogo nuevo en GitHub y/o versión nueva del código en disco.
async function runUpdates() {
  checkDeadlines().catch((e) => console.warn(`[${BRAND.name}] plazos`, e));
  checkWrapped().catch((e) => console.warn(`[${BRAND.name}] wrapped`, e));
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

// ---------- Caídas de la sede ----------
// Se escuchan solo las cargas de página (no imágenes ni scripts) de las webs con permiso: las sedes y la
// infraestructura común (Cl@ve, Red SARA, FNMT). Si la misma
// pestaña falla varias veces seguidas en 20 segundos cuenta como una sola caída.

const lastOutage = new Map(); // `${tabId}:${game}` → ts

function onOutage(details) {
  const kind = outageKind(details);
  if (!kind || details.tabId < 0) return;
  serial(async () => {
    const [settings, catalog, data] = await Promise.all([loadSettings(), getCatalog(), loadData()]);
    const game = outageTarget(details.url, enabledGames(catalog, settings), catalog.infra);
    if (!game) return;
    const key = `${details.tabId}:${game.id}`;
    const now = Date.now();
    if (now - (lastOutage.get(key) || 0) < 20_000) return;
    lastOutage.set(key, now);
    const totals = recordOutage(data, game.id, now);
    const { cloud } = await chrome.storage.local.get('cloud');
    const fresh = evaluate(mergeData(data, cloud), catalog.achievements, now);
    await saveData(data);
    const items = [];
    // Aviso de la caída solo la primera vez del día en cada sede, para no echar sal en la herida.
    const today = data.outages[dayKey(now)][game.id];
    if (today === 1) items.push({ id: `caida-${game.id}-${now}`, kind: 'info', emoji: '💥', label: `${game.name} se ha caído (${kind})`, name: `Caída nº ${totals.game} de ${game.name}`, desc: 'Respira y reintenta. Queda apuntado en tus estadísticas.' });
    items.push(...fresh.map((a) => ({ id: `logro-${a.id}`, kind: 'ach', emoji: a.emoji, label: '¡Logro desbloqueado!', name: a.name, desc: a.desc })));
    if (fresh.length) {
      const { unseen = [] } = await chrome.storage.local.get('unseen');
      await chrome.storage.local.set({ unseen: [...new Set([...unseen, ...fresh.map((a) => a.id)])] });
    }
    await announce(items, settings);
  });
}

const PAGE_FILTER = { urls: chrome.runtime.getManifest().host_permissions || [], types: ['main_frame', 'sub_frame'] };
chrome.webRequest.onCompleted.addListener(onOutage, PAGE_FILTER);
chrome.webRequest.onErrorOccurred.addListener(onOutage, PAGE_FILTER);

// ---------- Sincronización entre PCs ----------
// 1) Foto de los datos (en la cola, rápido). 2) Subir lo cambiado y bajar lo nuevo (fuera de la cola:
// la red no bloquea el contador). 3) Aplicar lo bajado sobre los datos frescos (en la cola).

const SYNC = 'sync';
let syncing = null;

function deviceLabel() {
  const p = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  return p.includes('mac') ? 'Chrome en Mac' : p.includes('win') ? 'Chrome en Windows' : p.includes('linux') ? 'Chrome en Linux' : 'Chrome';
}

function cloudSync() {
  if (!CLOUD_ENABLED) return Promise.resolve();
  syncing ||= runSync().finally(() => (syncing = null));
  return syncing;
}

async function runSync() {
  const session = await getSession();
  if (!session) return;
  let snap;
  await serial(async () => {
    const [data, settings, { cloud }] = await Promise.all([loadData(), loadSettings(), chrome.storage.local.get('cloud')]);
    snap = { data, settings, cloud: { ...emptyCloud(), ...(cloud || {}) } };
  });
  const cloud = snap.cloud;
  const uid = session.user.id;
  try {
    // Este PC, dado de alta una vez.
    if (!cloud.deviceId) {
      const [dev] = await api('/devices', { method: 'POST', body: { user_id: uid, name: deviceLabel() }, prefer: 'return=representation' });
      cloud.deviceId = dev.id;
      cloud.deviceName = dev.name;
      cloud.sent = {};
    }
    const devices = await api('/devices?select=id,name,created_at,last_sync_at&order=created_at.asc');
    if (!devices.some((d) => d.id === cloud.deviceId)) {
      // Lo han quitado desde otro PC: en la próxima vuelta se vuelve a dar de alta y sube todo.
      await serial(() => chrome.storage.local.set({ cloud: { ...emptyCloud(), status: { at: Date.now(), error: null } } }));
      return;
    }
    cloud.deviceName = devices.find((d) => d.id === cloud.deviceId).name;

    // Subir
    const up = buildUploads(snap.data, cloud, cloud.deviceId, uid);
    await upsert('day_stats', up.dayStats, 'user_id,device_id,day,game');
    await upsert('day_extras', up.extras, 'user_id,device_id,day');
    await upsert('device_records', up.records, 'user_id,device_id');
    await upsert('achievements', up.achievements, 'user_id,achievement_id');
    await upsert('challenges', up.challenges, 'user_id,week,challenge_id', { ignore: true });
    await upsert('daily_bonus', up.bonus, 'user_id,day', { ignore: true });
    Object.assign(cloud.sent, up.sent);

    // Perfil: gana el cambio más reciente
    const [remoteProfile] = await api('/profiles?select=display_name,profile,prefs,updated_at');
    const action = profileAction(snap.settings, remoteProfile, cloud);
    if (action === 'push') {
      const profile = snap.settings.profile || {};
      const prefs = prefsOf(snap.settings);
      await upsert('profiles', [{ user_id: uid, display_name: (profile.name || '').slice(0, 30) || null, profile, prefs }], 'user_id');
      cloud.sent.profile = syncSig(profile, prefs);
    }

    // Bajar (lo de los otros PCs, solo lo cambiado desde la última vez)
    const me = cloud.deviceId;
    const since = (k) => encodeURIComponent(cloud.lastPull[k] || '1970-01-01T00:00:00Z');
    const rows = await selectAll(`/day_stats?select=device_id,day,game,ms,slots,updated_at&device_id=neq.${me}&updated_at=gt.${since('days')}&order=updated_at.asc`);
    const extras = await selectAll(`/day_extras?select=device_id,day,loading_ms,outages,updated_at&device_id=neq.${me}&updated_at=gt.${since('extras')}&order=updated_at.asc`);
    const records = await api(`/device_records?select=device_id,records&device_id=neq.${me}`);
    const achievements = await selectAll('/achievements?select=achievement_id,unlocked_at');
    const challenges = await selectAll('/challenges?select=week,challenge_id,completed_at,xp');
    const bonus = await selectAll('/daily_bonus?select=day,xp');
    if (rows.length) cloud.lastPull.days = rows[rows.length - 1].updated_at;
    if (extras.length) cloud.lastPull.extras = extras[extras.length - 1].updated_at;

    await api(`/devices?id=eq.${me}`, { method: 'PATCH', body: { last_sync_at: new Date().toISOString() }, prefer: 'return=minimal' });
    cloud.status = { at: Date.now(), error: null };

    // Aplicar sobre los datos de ahora (pueden haber cambiado mientras íbamos a la red)
    await serial(async () => {
      const [data, settings] = await Promise.all([loadData(), loadSettings()]);
      const { personChanged } = applyPulled(data, cloud, { devices, rows, extras, records, achievements, challenges, bonus });
      if (personChanged) await saveData(data);
      if (action === 'pull') {
        const prefs = Object.fromEntries(Object.entries(remoteProfile.prefs || {}).filter(([k]) => SYNCED_PREFS.includes(k)));
        await saveSettings({ ...settings, ...prefs, profile: remoteProfile.profile || {}, profileUpdatedAt: Date.parse(remoteProfile.updated_at) });
        cloud.sent.profile = syncSig(remoteProfile.profile, remoteProfile.prefs);
      }
      await chrome.storage.local.set({ cloud });
    });
  } catch (e) {
    console.warn(`[${BRAND.name}] sincronización`, e.message);
    await serial(async () => {
      const { cloud: now } = await chrome.storage.local.get('cloud');
      await chrome.storage.local.set({ cloud: { ...emptyCloud(), ...(now || cloud), status: { at: Date.now(), error: e.message } } });
    });
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
  if (!(await chrome.alarms.get(SYNC))) await chrome.alarms.create(SYNC, { periodInMinutes: 10, delayInMinutes: 0.5 });
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
  if (a.name === SYNC) cloudSync();
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
  if (id.startsWith('wrapped-')) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`wrapped.html?periodo=${id.slice(8)}`) });
    chrome.notifications.clear(id);
    return;
  }
  const hash = id.startsWith('logro') ? '#logros'
    : id.startsWith('recompensa') ? '#perfil'
      : id.startsWith('plazo') || id.startsWith('temporada') || id.startsWith('reto') ? '#temporada'
        : id.startsWith('nivel') ? '#estadisticas' : '#biblioteca';
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html' + hash) });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // El popup pide un apunte al abrirse para enseñar cifras al segundo.
  if (msg?.type === 'flush') {
    tick('flush').then(() => reply(true));
    return true;
  }
  if (msg?.type === 'test-toast') {
    loadSettings().then(async (settings) => {
      const items = [{ id: 'prueba', kind: 'ach', emoji: '🧪', label: '¡Logro desbloqueado!', name: 'Aviso de prueba', desc: 'Así saldrán tus logros mientras trabajas en la sede.' }];
      if (msg.system) notify('prueba', `${items[0].emoji} ${items[0].label}`, `${items[0].name} — ${items[0].desc}`);
      else await announce(items, { ...settings, notifications: true });
      reply(true);
    });
    return true;
  }
  if (msg?.type === 'cloud-sync') {
    cloudSync().then(() => reply(true));
    return true;
  }
  if (msg?.type === 'check-updates') {
    runUpdates().then(() => reply(true));
    return true;
  }
});
