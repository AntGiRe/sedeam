// Wrapped: el resumen de un mes o de un año, al estilo de los resúmenes musicales de fin de año.
// Todo se calcula a partir de los datos; no se guarda nada.

import { HOUR, MIN, addDays, dayKey, parseKey, total } from './core.js';
import { deadlinesBetween } from './calendar.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// '2026-10' → mes; '2026' → año.
export function parsePeriod(id) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(id || '');
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2]) {
    const mo = Number(m[2]);
    const from = new Date(y, mo - 1, 1);
    const to = new Date(y, mo, 0);
    return {
      id, kind: 'month', from: dayKey(from), to: dayKey(to), name: MONTHS[mo - 1], label: `${MONTHS[mo - 1]} de ${y}`,
      prev: dayKey(new Date(y, mo - 2, 1)).slice(0, 7),
    };
  }
  return { id, kind: 'year', from: `${y}-01-01`, to: `${y}-12-31`, name: String(y), label: String(y), prev: String(y - 1) };
}

// El último periodo cerrado (el mes pasado) y, en enero, también el año pasado.
export function latestPeriods(now = new Date()) {
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const out = [dayKey(lastMonth).slice(0, 7)];
  if (now.getMonth() === 0) out.unshift(String(now.getFullYear() - 1));
  return out;
}

// Equivalencias para dar perspectiva (y un poco de vértigo).
const EQUIVALENCES = [
  { min: 110, one: 'película', many: 'películas', emoji: '🎬' },
  { min: 170, one: 'vuelo Madrid–Canarias', many: 'vuelos Madrid–Canarias', emoji: '✈️' },
  { min: 105, one: 'partido de fútbol', many: 'partidos de fútbol', emoji: '⚽' },
  { min: 45, one: 'capítulo de serie', many: 'capítulos de serie', emoji: '📺' },
  { min: 12 * 60, one: 'vuelta al mundo en avión… a medias', many: 'medias vueltas al mundo en avión', emoji: '🌍' },
];

export function equivalence(ms, seed = 0) {
  const usable = EQUIVALENCES.filter((e) => ms / MIN >= e.min * 2);
  if (!usable.length) return null;
  const e = usable[seed % usable.length];
  const n = Math.floor(ms / MIN / e.min);
  return { n, text: `${n.toLocaleString('es-ES')} ${n === 1 ? e.one : e.many}`, emoji: e.emoji };
}

// La personalidad gestoril del periodo. La primera regla que se cumple, gana.
export const PERSONALITIES = [
  { id: 'apagafuegos', emoji: '🔥', name: 'El Apagafuegos del día 20', desc: 'Tu tiempo se dispara justo antes de cada plazo. Trabajas mejor con el agua al cuello.' },
  { id: 'vampiro', emoji: '🧛', name: 'El Vampiro Fiscal', desc: 'Cuando el resto duerme, tú presentas modelos. La sede de noche es más tranquila, ¿verdad?' },
  { id: 'madrugador', emoji: '🐓', name: 'El Gallo Tributario', desc: 'Antes de las 9 ya llevas un buen rato en la sede. Café en una mano, certificado en la otra.' },
  { id: 'pluriempleado', emoji: '🐙', name: 'El Pulpo Administrativo', desc: 'Un tentáculo en la AEAT, otro en la Seguridad Social, otro en el Catastro… Lo tocas todo.' },
  { id: 'fiel', emoji: '💍', name: 'El Monógamo de la Sede', desc: 'Casi todo tu tiempo en una sola web. Fidelidad absoluta.' },
  { id: 'constante', emoji: '📏', name: 'El Metódico', desc: 'Un poco cada día, sin sustos. Si existiera el gestor ideal, se parecería a ti.' },
  { id: 'zen', emoji: '🧘', name: 'El Gestor Zen', desc: 'Entras, haces lo justo y sales. La sede no puede contigo.' },
];

export function computeWrapped(data, catalog, periodId, games = catalog.games) {
  const p = parsePeriod(periodId);
  if (!p) return null;
  const inP = (k) => k >= p.from && k <= p.to;
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));

  const perGame = {};
  const perDay = {};
  const weekday = new Array(7).fill(0);
  for (const [k, day] of Object.entries(data.days)) {
    if (!inP(k)) continue;
    const t = total(day);
    if (!t) continue;
    perDay[k] = t;
    weekday[parseKey(k).getDay()] += t;
    for (const [g, ms] of Object.entries(day)) perGame[g] = (perGame[g] || 0) + ms;
  }
  const totalMs = total(perGame);

  const hours = new Array(24).fill(0);
  for (const [k, day] of Object.entries(data.slots || {})) {
    if (!inP(k)) continue;
    for (const byHour of Object.values(day)) for (const [h, ms] of Object.entries(byHour)) hours[Number(h)] += ms;
  }
  const hoursKnown = total(hours) > 0;
  const nightMs = [22, 23, 0, 1, 2, 3, 4, 5].reduce((a, h) => a + hours[h], 0);
  const earlyMs = [5, 6, 7, 8].reduce((a, h) => a + hours[h], 0);
  const peakHour = hoursKnown ? hours.indexOf(Math.max(...hours)) : null;

  const prev = parsePeriod(p.prev);
  const prevMs = Object.entries(data.days).filter(([k]) => k >= prev.from && k <= prev.to).reduce((a, [, d]) => a + total(d), 0);

  // Tiempo en los 5 días anteriores a cada gran plazo (incluido el día del plazo).
  const majors = deadlinesBetween((catalog.deadlines || []).filter((d) => d.major), parseKey(p.from), addDays(parseKey(p.to), 5));
  const rush = new Set();
  for (const d of majors) for (let i = 0; i < 5; i++) rush.add(dayKey(addDays(d.date, -i)));
  const rushMs = Object.entries(perDay).filter(([k]) => rush.has(k)).reduce((a, [, v]) => a + v, 0);

  const ranking = Object.entries(perGame).sort((a, b) => b[1] - a[1]).map(([id, ms]) => ({ id, ms, game: byId[id] || { id, name: id, emoji: '🎮', color: '#8f98a0' }, share: ms / totalMs }));
  const bestDay = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0];
  const daysActive = Object.values(perDay).filter((v) => v >= 5 * MIN).length;
  const favWeekday = weekday.some(Boolean) ? weekday.indexOf(Math.max(...weekday)) : null;

  const loadingMs = Object.entries(data.loading || {}).filter(([k]) => inP(k)).reduce((a, [, v]) => a + v, 0);
  const outages = Object.entries(data.outages || {}).filter(([k]) => inP(k)).reduce((a, [, d]) => a + total(d), 0);
  const fromTs = parseKey(p.from).getTime();
  const toTs = addDays(parseKey(p.to), 1).getTime();
  const achievements = (catalog.achievements || []).filter((a) => data.achievements[a.id] >= fromTs && data.achievements[a.id] < toTs);
  const challenges = Object.values(data.challenges || {}).flatMap((w) => Object.values(w)).filter((c) => c.ts >= fromTs && c.ts < toTs).length;

  const periodDays = Math.round((toTs - fromTs) / (24 * HOUR));
  const share = (ms) => (totalMs ? ms / totalMs : 0);
  const personality =
    totalMs < HOUR ? PERSONALITIES.find((x) => x.id === 'zen')
      : majors.length && share(rushMs) >= 0.35 ? PERSONALITIES[0]
        : hoursKnown && share(nightMs) >= 0.1 ? PERSONALITIES[1]
          : hoursKnown && share(earlyMs) >= 0.2 ? PERSONALITIES[2]
            : ranking.filter((r) => r.ms >= HOUR).length >= 4 ? PERSONALITIES[3]
              : ranking[0]?.share >= 0.85 ? PERSONALITIES[4]
                : daysActive >= periodDays * 0.45 ? PERSONALITIES[5]
                  : PERSONALITIES[6];

  return {
    period: p,
    totalMs,
    prevMs,
    change: prevMs ? (totalMs - prevMs) / prevMs : null,
    equivalence: equivalence(totalMs, Number(p.id.replace(/\D/g, '')) || 0),
    ranking,
    bestDay: bestDay ? { day: bestDay[0], ms: bestDay[1] } : null,
    daysActive,
    favWeekday: favWeekday == null ? null : WEEKDAYS[favWeekday],
    hours,
    peakHour,
    nightMs,
    rushMs,
    loadingMs,
    outages,
    achievements,
    challenges,
    personality,
  };
}
