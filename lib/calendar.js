// Calendario fiscal: plazos recurrentes y temporadas trimestrales.
//
// Todo sale del catálogo (deadlines y seasons), así que se corrige o amplía publicando un
// catalog.json nuevo. Las fechas son orientativas: si un plazo cae en fin de semana pasa al lunes,
// pero los festivos no se tienen en cuenta. Manda siempre el calendario oficial de la AEAT.

import { DAY, HOUR, addDays, dayKey, sumRange, total } from './core.js';
import { challengeBonusMs } from './challenges.js';

const startOfDay = (d) => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

// Por defecto un plazo en fin de semana pasa al lunes (regla de Hacienda). Con 'before' se adelanta
// al viernes: es lo prudente para avisos como el cierre de cotizaciones de fin de mes.
export function shiftToWorkday(date, direction = 'after') {
  const d = startOfDay(date);
  const step = direction === 'before' ? -1 : 1;
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + step);
  return d;
}

// month 1-12; day: número o 'last'
function dateOf(year, month, day) {
  if (day === 'last') return new Date(year, month, 0);
  const last = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, last));
}

export function daysUntil(date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY);
}

// Plazos concretos entre dos fechas (ambas incluidas), ordenados por fecha.
export function deadlinesBetween(defs = [], from, to) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  const out = [];
  for (let y = a.getFullYear() - 1; y <= b.getFullYear(); y++) {
    for (const def of defs) {
      for (const m of def.months || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const date = shiftToWorkday(dateOf(y, m, def.day), def.shift);
        if (date >= a && date <= b) out.push({ ...def, date, key: `${def.id}@${dayKey(date)}` });
      }
    }
  }
  return out.sort((x, z) => x.date - z.date || (z.major ? 1 : 0) - (x.major ? 1 : 0));
}

export function upcomingDeadlines(defs, now = new Date(), { limit = 6, horizon = 120 } = {}) {
  return deadlinesBetween(defs, now, addDays(now, horizon)).slice(0, limit);
}

// ---------- Temporadas ----------
//
// Una temporada es el tramo entre dos cierres trimestrales: la del "3T 2026" empieza el día después
// del cierre del 2T y acaba el día del cierre del 3T (20 de octubre, o el lunes siguiente).

function seasonEnds(cfg, year) {
  return cfg.ends.map((e) => ({ ...e, date: shiftToWorkday(dateOf(year, e.month, e.day)), year: year + (e.yearOffset || 0) }));
}

function allEnds(cfg, fromYear, toYear) {
  const list = [];
  for (let y = fromYear; y <= toYear; y++) list.push(...seasonEnds(cfg, y));
  return list.sort((a, b) => a.date - b.date);
}

function describe(cfg, end, prevEnd) {
  const meta = cfg.names?.[end.quarter] || {};
  return {
    id: `${end.quarter}-${end.year}`,
    quarter: end.quarter,
    year: end.year,
    label: `${end.quarter} ${end.year}`,
    name: meta.name || `Temporada ${end.quarter}`,
    emoji: meta.emoji || '🏁',
    color: meta.color || '#3987e5',
    start: addDays(prevEnd.date, 1),
    end: end.date,
  };
}

export function seasonAt(cfg, date = new Date()) {
  const d = startOfDay(date);
  const ends = allEnds(cfg, d.getFullYear() - 1, d.getFullYear() + 1);
  const i = ends.findIndex((e) => e.date >= d);
  return describe(cfg, ends[i], ends[i - 1]);
}

// Temporadas desde la que contiene `from` hasta la actual, de la más antigua a la más nueva.
export function seasonsSince(cfg, from, now = new Date()) {
  const out = [];
  let s = seasonAt(cfg, from);
  const current = seasonAt(cfg, now);
  while (out.length < 200) {
    out.push(s);
    if (s.id === current.id) break;
    s = seasonAt(cfg, addDays(s.end, 1));
  }
  return out;
}

// El pase avanza con las horas jugadas en la temporada más los puntos de los retos semanales.
export function seasonProgress(data, cfg, season) {
  const playedMs = total(sumRange(data, dayKey(season.start), dayKey(season.end)));
  const endTs = new Date(season.end).setHours(23, 59, 59, 999);
  const bonusMs = challengeBonusMs(data, new Date(season.start).getTime(), endTs);
  const ms = playedMs + bonusMs;
  const per = cfg.hoursPerTier * HOUR;
  const tier = Math.min(cfg.tiers, Math.floor(ms / per));
  return {
    ms,
    playedMs,
    bonusMs,
    tier,
    maxed: tier >= cfg.tiers,
    // fracción hacia el siguiente nivel de temporada
    progress: tier >= cfg.tiers ? 1 : (ms - tier * per) / per,
    msToNext: tier >= cfg.tiers ? 0 : (tier + 1) * per - ms,
  };
}

// Mejor nivel de temporada alcanzado y el de cada temporada jugada.
export function seasonHistory(data, cfg, now = new Date()) {
  const keys = Object.keys(data.days).filter((k) => total(data.days[k]) > 0).sort();
  if (!keys.length) return { best: 0, seasons: [] };
  const [y, m, d] = keys[0].split('-').map(Number);
  const seasons = seasonsSince(cfg, new Date(y, m - 1, d), now).map((s) => ({ ...s, ...seasonProgress(data, cfg, s) }));
  return { best: Math.max(0, ...seasons.map((s) => s.tier)), seasons };
}
