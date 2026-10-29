// Experiencia (XP): la moneda de la progresión.
//
//   ⏱  1 minuto activo en una sede            = 1 XP
//   ☀️  Primer fichaje del día                  = +10 XP (data.bonus[día])
//   🎯  Reto semanal completado                 = su xp en horas × 60 (p. ej. 2 h = +120 XP)
//
// El nivel (de Becario a Inspector honorífico) y el pase de temporada se miden en XP. Por dentro se
// sigue guardando el tiempo en milisegundos: 1 XP equivale a 1 minuto.

import { MIN, dayKey, levelFor, sumAll, total } from './core.js';

export const DAILY_BONUS_XP = 10;
// Cada cuánto tiempo jugado sale la píldora de "+XP" mientras trabajas.
export const XP_DROP_EVERY = 15 * MIN;

export const msToXp = (ms) => Math.floor(ms / MIN);
export const xpToMs = (xp) => xp * MIN;
export const fmtXp = (xp) => `${Math.round(xp).toLocaleString('es-ES')} XP`;

// XP extra (bonus diario y retos) entre dos días, ambos incluidos.
export function bonusXp(data, fromKey = '0000-00-00', toKey = '9999-99-99') {
  let xp = 0;
  for (const [k, v] of Object.entries(data.bonus || {})) if (k >= fromKey && k <= toKey) xp += v;
  for (const week of Object.values(data.challenges || {})) {
    for (const c of Object.values(week)) {
      const k = dayKey(c.ts);
      if (k >= fromKey && k <= toKey) xp += Math.round((c.xp || 0) * 60);
    }
  }
  return xp;
}

export function totalXp(data) {
  return msToXp(total(sumAll(data))) + bonusXp(data);
}

// Nivel a partir de la XP total. Añade las cifras en XP para enseñarlas.
export function levelOf(data, levels) {
  const xp = totalXp(data);
  const lv = levelFor(xpToMs(xp), levels);
  const i = lv.level - 1;
  const from = levels[i][0] * 60;
  const to = levels[i + 1] ? levels[i + 1][0] * 60 : null;
  return { ...lv, xp, xpInLevel: xp - from, xpForLevel: to ? to - from : null, xpToNext: to ? Math.max(0, to - xp) : 0 };
}

// Bonus del primer fichaje del día. Devuelve los XP dados (0 si ya se dieron hoy).
export function grantDailyBonus(data, now = Date.now()) {
  data.bonus ||= {};
  const k = dayKey(now);
  if (data.bonus[k]) return 0;
  data.bonus[k] = DAILY_BONUS_XP;
  return DAILY_BONUS_XP;
}

// ¿Cuántas "píldoras" de XP_DROP_EVERY se han cruzado entre dos cantidades de tiempo?
export function dropsCrossed(beforeMs, afterMs) {
  return Math.max(0, Math.floor(afterMs / XP_DROP_EVERY) - Math.floor(beforeMs / XP_DROP_EVERY));
}
