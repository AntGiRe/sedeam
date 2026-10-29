// Logros declarativos: cada logro del catálogo trae una regla en JSON (nunca código), así que se
// pueden añadir logros nuevos publicando un catalog.json nuevo, sin actualizar la extensión.
//
// Tipos de regla:
//   { type: 'time', agg, target: { hours | minutes }, game?, games?, months?, weekdays?, dates?, hours? }
//       agg: 'sum'  → todo el historial
//            'day'  → el mejor día
//            'year' → el mejor año natural (útil con months, p. ej. campaña de la Renta)
//            'run'  → la sesión continua más larga
//       months: [1-12] · weekdays: [0=domingo … 6=sábado] · dates: ['MM-DD', '*-DD']
//       hours: [desde, hasta) en horas del día; si desde > hasta cruza medianoche ([23, 6])
//   { type: 'streak', days }                 racha de días laborables
//   { type: 'daysPlayed', days, game?, minutes? }  días distintos con actividad (de un juego, si se indica)
//   { type: 'gamesPlayed', count, minutes }  juegos distintos con al menos esos minutos
//   { type: 'sameDay', games, minutes }      todos esos juegos el mismo día
//   { type: 'loading', agg: 'sum'|'day', target }     tiempo en pantallas de identificación (Cl@ve)
//   { type: 'outages', agg: 'sum'|'day', count, game? }  caídas de la sede
//   { type: 'outageSites', count }          webs distintas caídas en un mismo día
//   { type: 'challenges', count }           retos semanales completados en total
//   { type: 'challengeWeek', count }        retos completados en una misma semana
//   { type: 'tabs', count, game?, perGame? } récord de pestañas a la vez: de un juego, de cualquier
//                                            juego por separado (perGame) o de todas las sedes juntas
//
// Un tipo desconocido (catálogo más nuevo que la extensión) se ignora sin romper nada.

import { HOUR, MIN, parseKey, streaks, sumAll, total } from './core.js';

export const RULE_TYPES = ['time', 'streak', 'daysPlayed', 'gamesPlayed', 'sameDay', 'loading', 'outages', 'outageSites', 'tabs', 'challenges', 'challengeWeek'];

const targetMs = (t = {}) => (t.hours || 0) * HOUR + (t.minutes || 0) * MIN;

function dateMatches(rule, key) {
  if (!rule.months && !rule.weekdays && !rule.dates) return true;
  const d = parseKey(key);
  if (rule.months && !rule.months.includes(d.getMonth() + 1)) return false;
  if (rule.weekdays && !rule.weekdays.includes(d.getDay())) return false;
  if (rule.dates) {
    const md = key.slice(5);
    const dd = key.slice(8);
    if (!rule.dates.some((x) => x === md || x === `*-${dd}`)) return false;
  }
  return true;
}

function inWindow([from, to], h) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

function dayValue(data, rule, key) {
  const games = rule.game ? [rule.game] : rule.games || null;
  if (rule.hours) {
    const slots = data.slots[key] || {};
    let ms = 0;
    for (const [g, byHour] of Object.entries(slots)) {
      if (games && !games.includes(g)) continue;
      for (const [h, v] of Object.entries(byHour)) if (inWindow(rule.hours, Number(h))) ms += v;
    }
    return ms;
  }
  const day = data.days[key] || {};
  return games ? games.reduce((a, g) => a + (day[g] || 0), 0) : total(day);
}

// Devuelve { value, target, unit } o null si la regla no se entiende. Una regla mal escrita en un
// catálogo descargado nunca debe tumbar el contador, de ahí el try.
export function progress(rule, data, now = new Date()) {
  try {
    const p = compute(rule, data, now);
    return p && Number.isFinite(p.value) && p.target > 0 ? p : null;
  } catch {
    return null;
  }
}

function compute(rule, data, now) {
  switch (rule?.type) {
    case 'time': {
      const target = targetMs(rule.target);
      if (!target) return null;
      if (rule.agg === 'run') {
        const value = rule.game ? data.bestRuns[rule.game] || 0 : data.longestRun?.ms || 0;
        return { value, target, unit: 'ms' };
      }
      let sum = 0;
      let best = 0;
      const years = {};
      for (const key of Object.keys(data.days)) {
        if (!dateMatches(rule, key)) continue;
        const ms = dayValue(data, rule, key);
        sum += ms;
        best = Math.max(best, ms);
        years[key.slice(0, 4)] = (years[key.slice(0, 4)] || 0) + ms;
      }
      const value = rule.agg === 'day' ? best : rule.agg === 'year' ? Math.max(0, ...Object.values(years)) : sum;
      return { value, target, unit: 'ms' };
    }
    case 'streak':
      return { value: streaks(data, now).best, target: rule.days, unit: 'days' };
    case 'daysPlayed': {
      const min = (rule.minutes || 5) * MIN;
      const value = Object.values(data.days).filter((d) => (rule.game ? d[rule.game] || 0 : total(d)) >= min).length;
      return { value, target: rule.days, unit: 'days' };
    }
    case 'gamesPlayed': {
      const min = (rule.minutes || 5) * MIN;
      return { value: Object.values(sumAll(data)).filter((ms) => ms >= min).length, target: rule.count, unit: 'count' };
    }
    case 'sameDay': {
      if (!Array.isArray(rule.games) || !rule.games.length) return null;
      const min = (rule.minutes || 10) * MIN;
      const ok = Object.values(data.days).some((day) => rule.games.every((g) => (day[g] || 0) >= min));
      return { value: ok ? 1 : 0, target: 1, unit: 'bool' };
    }
    case 'loading': {
      const target = targetMs(rule.target);
      if (!target) return null;
      const vals = Object.values(data.loading || {});
      return { value: rule.agg === 'day' ? Math.max(0, ...vals) : vals.reduce((a, b) => a + b, 0), target, unit: 'ms' };
    }
    case 'outages': {
      const per = Object.values(data.outages || {}).map((day) => (rule.game ? day[rule.game] || 0 : total(day)));
      return { value: rule.agg === 'day' ? Math.max(0, ...per) : per.reduce((a, b) => a + b, 0), target: rule.count, unit: 'count' };
    }
    case 'outageSites':
      return { value: Math.max(0, ...Object.values(data.outages || {}).map((day) => Object.values(day).filter((n) => n > 0).length)), target: rule.count, unit: 'count' };
    case 'challenges':
      return { value: Object.values(data.challenges || {}).reduce((a, w) => a + Object.keys(w).length, 0), target: rule.count, unit: 'count' };
    case 'challengeWeek':
      return { value: Math.max(0, ...Object.values(data.challenges || {}).map((w) => Object.keys(w).length)), target: rule.count, unit: 'count' };
    case 'tabs': {
      const byGame = data.tabs?.byGame || {};
      const value = rule.game ? byGame[rule.game]?.count || 0
        : rule.perGame ? Math.max(0, ...Object.values(byGame).map((r) => r.count))
          : data.tabs?.all?.count || 0;
      return { value, target: rule.count, unit: 'count' };
    }
    default:
      return null;
  }
}

// Marca como desbloqueados los logros que ya se cumplen y devuelve los nuevos.
export function evaluate(data, achievements, now = Date.now()) {
  const fresh = [];
  for (const a of achievements) {
    if (data.achievements[a.id]) continue;
    const p = progress(a.rule, data, new Date(now));
    if (p && p.value >= p.target) {
      data.achievements[a.id] = now;
      fresh.push(a);
    }
  }
  return fresh;
}
