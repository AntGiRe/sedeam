// Sincronización entre PCs: la parte pura (sin red ni chrome.*), para poder probarla con Node.
//
// Modelo:
//   · `data` (chrome.storage.local) sigue siendo lo de ESTE PC, como siempre.
//   · `cloud` guarda lo que llega de tus OTROS PCs y el estado de la sincronización:
//       { deviceId, deviceName, sent: { clave: firma }, lastPull: {...},
//         others: { rows: { 'dev|día|juego': { day, game, ms, slots } },
//                   extras: { 'dev|día': { day, loading_ms, outages } },
//                   records: { dev: records } },
//         devices: [...], status: { at, error } }
//   · Lo que se enseña y lo que cuenta para logros/niveles es mergeData(data, cloud): la suma.
//   · Lo que es de la persona (logros, retos, bonus diario) se fusiona directamente en `data`, porque
//     la unión es correcta en cualquier PC. mergeData comparte esos objetos con `data`, así que si
//     un cálculo desbloquea algo sobre la vista sumada, queda apuntado en `data`.

const clone = (o) => (o ? structuredClone(o) : {});
const MAX_DAY_MS = 86_400_000;

export function emptyCloud() {
  return { deviceId: null, deviceName: '', sent: {}, lastPull: {}, others: { rows: {}, extras: {}, records: {} }, devices: [], status: null };
}

export function mergeData(data, cloud) {
  const o = cloud?.others;
  if (!o || (!Object.keys(o.rows || {}).length && !Object.keys(o.extras || {}).length && !Object.keys(o.records || {}).length)) return data;
  const m = {
    ...data,
    days: clone(data.days),
    slots: clone(data.slots),
    hours: clone(data.hours),
    loading: { ...(data.loading || {}) },
    outages: clone(data.outages),
    bestRuns: { ...(data.bestRuns || {}) },
    firstPlayed: { ...(data.firstPlayed || {}) },
    lastPlayed: { ...(data.lastPlayed || {}) },
    tabs: { all: data.tabs?.all || null, byGame: { ...(data.tabs?.byGame || {}) } },
  };
  for (const r of Object.values(o.rows || {})) {
    (m.days[r.day] ||= {})[r.game] = (m.days[r.day][r.game] || 0) + r.ms;
    for (const [h, v] of Object.entries(r.slots || {})) {
      const slot = ((m.slots[r.day] ||= {})[r.game] ||= {});
      slot[h] = (slot[h] || 0) + v;
      const hours = (m.hours[r.game] ||= new Array(24).fill(0));
      hours[Number(h)] += v;
    }
  }
  for (const x of Object.values(o.extras || {})) {
    if (x.loading_ms) m.loading[x.day] = (m.loading[x.day] || 0) + x.loading_ms;
    for (const [g, n] of Object.entries(x.outages || {})) {
      const day = (m.outages[x.day] ||= {});
      day[g] = (day[g] || 0) + n;
    }
  }
  for (const rec of Object.values(o.records || {})) {
    for (const [g, ms] of Object.entries(rec.bestRuns || {})) m.bestRuns[g] = Math.max(m.bestRuns[g] || 0, ms);
    for (const [g, ts] of Object.entries(rec.firstPlayed || {})) m.firstPlayed[g] = Math.min(m.firstPlayed[g] || Infinity, ts);
    for (const [g, ts] of Object.entries(rec.lastPlayed || {})) m.lastPlayed[g] = Math.max(m.lastPlayed[g] || 0, ts);
    if (rec.longestRun && rec.longestRun.ms > (m.longestRun?.ms || 0)) m.longestRun = rec.longestRun;
    if (rec.tabs?.all && rec.tabs.all.count > (m.tabs.all?.count || 0)) m.tabs.all = rec.tabs.all;
    for (const [g, r] of Object.entries(rec.tabs?.byGame || {})) if (r.count > (m.tabs.byGame[g]?.count || 0)) m.tabs.byGame[g] = r;
  }
  // Lo de la persona: los mismos objetos que en `data` (ver arriba).
  m.achievements = data.achievements;
  m.challenges = data.challenges;
  m.bonus = data.bonus;
  return m;
}

const roundSlots = (slots = {}) => Object.fromEntries(Object.entries(slots).filter(([, v]) => v > 0).map(([h, v]) => [h, Math.round(v)]));
const iso = (ts) => new Date(ts).toISOString();
const okDay = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k >= '2020-01-01' && k <= '2100-01-01';

// Filas a subir (solo lo que ha cambiado desde la última subida correcta) y las firmas nuevas,
// que se guardan en cloud.sent cuando la subida termina bien.
export function buildUploads(data, cloud, deviceId, userId) {
  const sent = cloud.sent || {};
  const nextSent = {};
  const out = { dayStats: [], extras: [], records: [], achievements: [], challenges: [], bonus: [] };
  const mark = (key, sig) => {
    if (sent[key] === sig) return false;
    nextSent[key] = sig;
    return true;
  };

  for (const [day, games] of Object.entries(data.days || {})) {
    if (!okDay(day)) continue;
    for (const [game, ms] of Object.entries(games)) {
      if (!(ms > 0) || game.length > 40) continue;
      const slots = roundSlots(data.slots?.[day]?.[game]);
      const row = { user_id: userId, device_id: deviceId, day, game, ms: Math.min(MAX_DAY_MS, Math.round(ms)), slots };
      if (mark(`d|${day}|${game}`, `${row.ms}|${JSON.stringify(slots)}`)) out.dayStats.push(row);
    }
  }

  const extraDays = new Set([...Object.keys(data.loading || {}), ...Object.keys(data.outages || {})]);
  for (const day of extraDays) {
    if (!okDay(day)) continue;
    const row = { user_id: userId, device_id: deviceId, day, loading_ms: Math.min(MAX_DAY_MS, Math.round(data.loading?.[day] || 0)), outages: data.outages?.[day] || {} };
    if (mark(`x|${day}`, JSON.stringify([row.loading_ms, row.outages]))) out.extras.push(row);
  }

  const records = { tabs: data.tabs || {}, bestRuns: data.bestRuns || {}, longestRun: data.longestRun || null, firstPlayed: data.firstPlayed || {}, lastPlayed: data.lastPlayed || {} };
  if (mark('r', JSON.stringify(records))) out.records.push({ user_id: userId, device_id: deviceId, records });

  for (const [id, ts] of Object.entries(data.achievements || {})) {
    if (mark(`a|${id}`, String(ts))) out.achievements.push({ user_id: userId, achievement_id: id, unlocked_at: iso(ts) });
  }
  for (const [week, list] of Object.entries(data.challenges || {})) {
    for (const [id, c] of Object.entries(list)) {
      if (mark(`c|${week}|${id}`, String(c.ts))) out.challenges.push({ user_id: userId, week, challenge_id: id, completed_at: iso(c.ts), xp: c.xp || 2 });
    }
  }
  for (const [day, xp] of Object.entries(data.bonus || {})) {
    if (okDay(day) && mark(`b|${day}`, String(xp))) out.bonus.push({ user_id: userId, day, xp });
  }
  return { ...out, sent: nextSent };
}

// Mete en `cloud` lo que llega de los otros PCs y en `data` lo que es de la persona.
// pulled = { devices, rows, extras, records, achievements, challenges, bonus }
export function applyPulled(data, cloud, pulled) {
  const me = cloud.deviceId;
  const o = (cloud.others ||= { rows: {}, extras: {}, records: {} });
  const alive = new Set((pulled.devices || []).map((d) => d.id));

  for (const r of pulled.rows || []) if (r.device_id !== me) o.rows[`${r.device_id}|${r.day}|${r.game}`] = { day: r.day, game: r.game, ms: r.ms, slots: r.slots || {} };
  for (const x of pulled.extras || []) if (x.device_id !== me) o.extras[`${x.device_id}|${x.day}`] = { day: x.day, loading_ms: x.loading_ms || 0, outages: x.outages || {} };
  for (const r of pulled.records || []) if (r.device_id !== me) o.records[r.device_id] = r.records || {};

  // PCs quitados desde otro sitio: fuera sus datos.
  if (pulled.devices) {
    for (const k of Object.keys(o.rows)) if (!alive.has(k.split('|')[0])) delete o.rows[k];
    for (const k of Object.keys(o.extras)) if (!alive.has(k.split('|')[0])) delete o.extras[k];
    for (const k of Object.keys(o.records)) if (!alive.has(k)) delete o.records[k];
    cloud.devices = pulled.devices;
  }

  let personChanged = false;
  data.achievements ||= {};
  for (const a of pulled.achievements || []) {
    const ts = Date.parse(a.unlocked_at);
    const mine = data.achievements[a.achievement_id];
    if (!mine || ts < mine) {
      data.achievements[a.achievement_id] = ts;
      personChanged = true;
    }
    cloud.sent[`a|${a.achievement_id}`] = String(data.achievements[a.achievement_id]);
  }
  data.challenges ||= {};
  for (const c of pulled.challenges || []) {
    const week = (data.challenges[c.week] ||= {});
    if (!week[c.challenge_id]) {
      week[c.challenge_id] = { ts: Date.parse(c.completed_at), xp: Number(c.xp) };
      personChanged = true;
    }
    cloud.sent[`c|${c.week}|${c.challenge_id}`] = String(week[c.challenge_id].ts);
  }
  data.bonus ||= {};
  for (const b of pulled.bonus || []) {
    if (!(data.bonus[b.day] >= b.xp)) {
      data.bonus[b.day] = b.xp;
      personChanged = true;
    }
    cloud.sent[`b|${b.day}`] = String(data.bonus[b.day]);
  }
  return { personChanged };
}

// Ajustes que viajan entre PCs junto al perfil (el resto, como el catálogo, lo decide el servidor).
export const SYNCED_PREFS = ['notifications', 'xpToasts', 'sound', 'deadlineAlerts', 'breakReminder', 'shortcuts'];
export const prefsOf = (settings) => Object.fromEntries(SYNCED_PREFS.filter((k) => k in settings).map((k) => [k, settings[k]]));
export const syncSig = (profile, prefs) => JSON.stringify({ profile: profile || {}, prefs: prefs || {} });

// Perfil y ajustes: gana el cambio más reciente. Devuelve 'pull' (aplicar lo remoto), 'push' o null.
export function profileAction(settings, remote, cloud) {
  const localTs = settings.profileUpdatedAt || 0;
  const remoteTs = remote ? Date.parse(remote.updated_at) : 0;
  const sig = syncSig(settings.profile, prefsOf(settings));
  if (remote && remoteTs > localTs && syncSig(remote.profile, remote.prefs) !== sig) return 'pull';
  if (cloud.sent?.profile !== sig && (localTs > remoteTs || !remote)) return 'push';
  return null;
}
