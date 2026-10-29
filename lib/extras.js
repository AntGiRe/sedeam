// Las estadísticas que no salen en la nómina: pantallas de carga (identificarse con Cl@ve),
// caídas de la sede y récords de pestañas abiertas a la vez.
//
// data.loading = { 'YYYY-MM-DD': ms }                       tiempo en pantallas de identificación
// data.outages = { 'YYYY-MM-DD': { [gameId]: n } }           errores del servidor al abrir una sede
// data.tabs    = { all: { count, ts }, byGame: { [gameId]: { count, ts } } }   récords de pestañas
//
// Nada de esto cuenta para el nivel ni para la temporada: es solo para reírse (o llorar).

import { dayKey, total } from './core.js';
import { hostMatches } from './games.js';

// Id reservado para la "partida" en pantallas de carga dentro de la sesión viva.
export const LOADING = '@carga';

export function isLoadingUrl(url, loading) {
  if (!loading) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if ((loading.domains || []).some((d) => hostMatches(host, d))) return true;
  const href = u.href.toLowerCase();
  return (loading.urlContains || []).some((s) => href.includes(s.toLowerCase()));
}

// Reparte [start, end) por días y lo suma (o resta) al contador de pantallas de carga.
export function addLoading(data, start, end, sign = 1) {
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(next, end);
    const k = dayKey(d);
    data.loading[k] = Math.max(0, (data.loading[k] || 0) + sign * (stop - t));
    t = stop;
  }
}

// ¿Es esta respuesta una caída de la sede? Solo errores del servidor o de conexión con él;
// los fallos de tu propia red (sin internet, DNS) o las cancelaciones no cuentan.
const SERVER_NET_ERRORS = new Set([
  'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_TIMED_OUT',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_HTTP2_PROTOCOL_ERROR',
  'net::ERR_SSL_PROTOCOL_ERROR',
]);

export function outageKind({ statusCode, error } = {}) {
  if (error) return SERVER_NET_ERRORS.has(error) ? error.replace('net::', '') : null;
  if (statusCode >= 500 && statusCode <= 599) return `HTTP ${statusCode}`;
  return null;
}

export function recordOutage(data, game, ts = Date.now()) {
  const k = dayKey(ts);
  const day = (data.outages[k] ||= {});
  day[game] = (day[game] || 0) + 1;
  return outageTotals(data, game);
}

export function outageTotals(data, game = null) {
  let all = 0;
  let mine = 0;
  for (const day of Object.values(data.outages)) {
    all += total(day);
    if (game) mine += day[game] || 0;
  }
  return { all, game: mine };
}

// counts: { [gameId]: pestañas abiertas ahora }. Devuelve true si se ha batido algún récord.
export function recordTabs(data, counts, ts = Date.now()) {
  let changed = false;
  const sum = total(counts);
  if (sum > (data.tabs.all?.count || 0)) {
    data.tabs.all = { count: sum, ts };
    changed = true;
  }
  for (const [g, n] of Object.entries(counts)) {
    if (n > (data.tabs.byGame[g]?.count || 0)) {
      data.tabs.byGame[g] = { count: n, ts };
      changed = true;
    }
  }
  return changed;
}
