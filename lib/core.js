// Modelo de datos y cálculos. Sin dependencias de chrome.*, para poder probarlo con Node.
//
// data = {
//   v: 2,
//   days:  { 'YYYY-MM-DD': { [gameId]: ms } },              // tiempo activo por día y juego
//   slots: { 'YYYY-MM-DD': { [gameId]: { [hora]: ms } } },  // mismo tiempo, desglosado por hora (desde v2)
//   hours: { [gameId]: number[24] },                         // reparto por hora de todo el historial
//   run:   { game, start, last, ms } | null,                 // sesión continua en curso
//   longestRun: { game, ms, day } | null,
//   bestRuns: { [gameId]: ms },                              // sesión más larga de cada juego
//   firstPlayed: { [gameId]: ts }, lastPlayed: { [gameId]: ts },
//   achievements: { [id]: ts },
// }
//
// Los datos nunca se borran al actualizar: cada versión nueva solo añade campos (ver migrate).

export const HOUR = 3600_000;
export const MIN = 60_000;
export const DAY = 24 * HOUR;
// Una pausa más corta que esto no rompe una sesión continua (maratones).
export const RUN_GAP = 5 * MIN;
export const DATA_VERSION = 2;

export function emptyData() {
  return {
    v: DATA_VERSION, days: {}, slots: {}, hours: {}, run: null, longestRun: null, bestRuns: {},
    firstPlayed: {}, lastPlayed: {}, achievements: {},
  };
}

export function migrate(d) {
  const out = { ...emptyData(), ...(d || {}) };
  if (!d?.v || d.v < 2) {
    // v1 → v2: aparecen slots y bestRuns. El histórico por horas de días antiguos no se puede reconstruir.
    if (d?.longestRun) out.bestRuns = { [d.longestRun.game]: d.longestRun.ms };
  }
  out.v = DATA_VERSION;
  return out;
}

// ---------- Fechas (siempre en hora local) ----------

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isWeekend(date) {
  const w = new Date(date).getDay();
  return w === 0 || w === 6;
}

// Trocea [start, end) en tramos que no cruzan cambio de hora (ni, por tanto, de día).
export function splitByHour(start, end) {
  const out = [];
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    const stop = Math.min(next, end);
    out.push({ day: dayKey(d), hour: d.getHours(), ms: stop - t });
    t = stop;
  }
  return out;
}

// ---------- Escritura ----------

function addTime(data, game, start, end, sign) {
  for (const { day, hour, ms } of splitByHour(start, end)) {
    const dayObj = (data.days[day] ||= {});
    dayObj[game] = Math.max(0, (dayObj[game] || 0) + sign * ms);
    const slot = ((data.slots[day] ||= {})[game] ||= {});
    slot[hour] = Math.max(0, (slot[hour] || 0) + sign * ms);
    const hours = (data.hours[game] ||= new Array(24).fill(0));
    hours[hour] = Math.max(0, hours[hour] + sign * ms);
  }
}

export function commitSegment(data, game, start, end) {
  if (!(end > start)) return;
  addTime(data, game, start, end, 1);
  data.firstPlayed[game] ||= start;
  data.lastPlayed[game] = end;

  const r = data.run;
  if (r && r.game === game && start - r.last <= RUN_GAP) {
    r.ms += end - start;
    r.last = end;
  } else {
    data.run = { game, start, last: end, ms: end - start };
  }
  if (!data.longestRun || data.run.ms > data.longestRun.ms) {
    data.longestRun = { game, ms: data.run.ms, day: dayKey(data.run.start) };
  }
  data.bestRuns[game] = Math.max(data.bestRuns[game] || 0, data.run.ms);
}

// Descuenta tiempo ya contado (lo que pasó entre el último gesto del usuario y el aviso de inactividad).
export function uncommitSegment(data, game, start, end) {
  if (!(end > start)) return;
  addTime(data, game, start, end, -1);
  const r = data.run;
  if (r && r.game === game) {
    r.ms = Math.max(0, r.ms - (end - start));
    r.last = Math.min(r.last, start);
  }
}

// ---------- Lectura ----------

export function sumRange(data, fromKey, toKey) {
  const totals = {};
  for (const [day, games] of Object.entries(data.days)) {
    if (day < fromKey || day > toKey) continue;
    for (const [g, ms] of Object.entries(games)) totals[g] = (totals[g] || 0) + ms;
  }
  return totals;
}

export function sumAll(data) {
  return sumRange(data, '0000-00-00', '9999-99-99');
}

export function total(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

export function dayTotal(data, key, game = null) {
  const d = data.days[key] || {};
  return game ? d[game] || 0 : total(d);
}

// Racha de días laborables con actividad. Los fines de semana no la rompen (y si se juega, suman).
export function streaks(data, today = new Date(), minMs = 5 * MIN) {
  const keys = Object.keys(data.days).filter((k) => dayTotal(data, k) >= minMs).sort();
  if (!keys.length) return { current: 0, best: 0 };
  const played = new Set(keys);
  const todayKey = dayKey(today);
  let cur = 0;
  let best = 0;
  for (let d = parseKey(keys[0]); dayKey(d) <= todayKey; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (played.has(k)) cur++;
    else if (!isWeekend(d) && k !== todayKey) cur = 0;
    best = Math.max(best, cur);
  }
  return { current: cur, best };
}

export function bestDay(data, game = null) {
  let best = null;
  for (const k of Object.keys(data.days)) {
    const ms = dayTotal(data, k, game);
    if (ms > 0 && (!best || ms > best.ms)) best = { day: k, ms };
  }
  return best;
}

// ---------- Niveles ----------

export function levelFor(totalMs, levels) {
  const h = totalMs / HOUR;
  let i = 0;
  while (i + 1 < levels.length && h >= levels[i + 1][0]) i++;
  const [from, title] = levels[i];
  const next = levels[i + 1];
  return {
    level: i + 1,
    title,
    nextTitle: next ? next[1] : null,
    progress: next ? (h - from) / (next[0] - from) : 1,
    hoursToNext: next ? next[0] - h : 0,
  };
}

// ---------- Formato ----------

export function fmtHours(ms) {
  const h = ms / HOUR;
  return h.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
}

export function fmtDur(ms) {
  const m = Math.floor(ms / MIN);
  if (m < 1) return ms > 0 ? '<1 min' : '0 min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function fmtBadge(ms) {
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return h < 10 ? `${h.toFixed(1).replace('.', ',')}h` : `${Math.floor(h)}h`;
}

// "Hoy", "Ayer", "hace 3 días", "12 oct."
export function fmtAgo(ts, now = Date.now()) {
  if (!ts) return 'Nunca';
  const days = Math.round((parseKey(dayKey(now)) - parseKey(dayKey(ts))) / DAY);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

// ---------- Versiones ----------

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
