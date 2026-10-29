// Retos semanales: cada semana (de lunes a domingo) tocan 3 retos del catálogo, siempre los mismos
// para esa semana. Usan las mismas reglas que los logros, pero contando solo lo jugado esa semana.
//
// Dos modos:
//   'min' (por defecto): se completa en cuanto llegas al objetivo ("6 h en un día").
//   'max': hay que NO pasarse ("menos de 1 h en la DGT"). Se resuelve al acabar la semana y
//          solo cuenta si esa semana jugaste al menos `minDays` días (no vale ganar sin jugar).
//
// Completar un reto da puntos de pase de temporada (xp, en horas): data.challenges[semana][id] = { ts, xp }.

import { DAY, addDays, dayKey, parseKey, total } from './core.js';
import { progress } from './rules.js';

export function weekOf(date = new Date()) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const end = addDays(start, 6);
  // Semana ISO: la del jueves de esa semana.
  const thu = addDays(start, 3);
  const jan4 = new Date(thu.getFullYear(), 0, 4);
  const week1 = new Date(jan4.getFullYear(), 0, 4 - ((jan4.getDay() + 6) % 7));
  const n = 1 + Math.round((thu - week1) / (7 * DAY));
  return { id: `${thu.getFullYear()}-S${String(n).padStart(2, '0')}`, start, end, from: dayKey(start), to: dayKey(end) };
}

// Barajado estable: la misma semana da siempre los mismos retos.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function pickChallenges(pool = [], weekId, n = 3) {
  const rnd = seeded(weekId);
  const list = [...pool];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // Como mucho un reto "de contención" (modo max) por semana: son los menos divertidos.
  const out = [];
  for (const c of list) {
    if (out.length >= n) break;
    if (c.mode === 'max' && out.some((x) => x.mode === 'max')) continue;
    out.push(c);
  }
  return out;
}

// Copia de los datos con solo lo ocurrido entre dos días (incluidos).
export function sliceData(data, from, to) {
  const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => k >= from && k <= to));
  return { ...data, days: pick(data.days), slots: pick(data.slots), loading: pick(data.loading), outages: pick(data.outages) };
}

const daysActive = (slice) => Object.values(slice.days).filter((d) => total(d) >= 5 * 60_000).length;

// Estado de un reto en una semana: { value, target, unit, done, failed, pending, pct }
export function challengeState(ch, data, week, now = new Date()) {
  const slice = sliceData(data, week.from, week.to);
  const p = progress(ch.rule, slice, now);
  if (!p) return null;
  const doneAt = data.challenges?.[week.id]?.[ch.id];
  const ended = dayKey(now) > week.to;
  if (ch.mode === 'max') {
    const over = p.value > p.target;
    const enough = daysActive(slice) >= (ch.minDays || 3);
    return {
      ...p,
      done: !!doneAt,
      failed: !doneAt && (over || (ended && !enough)),
      pending: !doneAt && !over && !ended,
      pct: over ? 1 : Math.min(1, p.value / p.target),
      daysActive: daysActive(slice),
    };
  }
  return { ...p, done: !!doneAt || p.value >= p.target, failed: !doneAt && ended && p.value < p.target, pending: !doneAt && p.value < p.target && !ended, pct: Math.min(1, p.value / p.target) };
}

// Apunta los retos recién completados (de esta semana y, para los de modo max, de la anterior).
// Devuelve la lista de retos nuevos.
export function resolveChallenges(data, pool, now = new Date()) {
  data.challenges ||= {};
  const fresh = [];
  const weeks = [weekOf(now), weekOf(addDays(now, -7))];
  for (const week of weeks) {
    for (const ch of pickChallenges(pool, week.id)) {
      if (data.challenges[week.id]?.[ch.id]) continue;
      const s = challengeState(ch, data, week, now);
      if (!s) continue;
      const ended = dayKey(now) > week.to;
      const ok = ch.mode === 'max' ? ended && !s.failed && s.value <= s.target : s.value >= s.target;
      if (ok) {
        // Lo que se cierra con la semana ya acabada se fecha en su domingo, para que el bonus
        // caiga en la temporada correcta.
        const ts = ended ? new Date(parseKey(week.to).setHours(23, 59)).getTime() : now.getTime();
        (data.challenges[week.id] ||= {})[ch.id] = { ts, xp: ch.xp || 2 };
        fresh.push({ ...ch, week });
      }
    }
  }
  return fresh;
}

// Horas extra de pase de temporada ganadas con retos entre dos instantes.
export function challengeBonusMs(data, startTs, endTs) {
  let ms = 0;
  for (const week of Object.values(data.challenges || {})) {
    for (const c of Object.values(week)) if (c.ts >= startTs && c.ts <= endTs) ms += (c.xp || 0) * 3600_000;
  }
  return ms;
}
