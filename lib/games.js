// Juegos = webs que se cronometran. Los oficiales vienen del catálogo (catalog.json, actualizable
// desde GitHub); el usuario puede añadir los suyos en Ajustes.

// Los juegos añadidos por el usuario comparten un gris neutro: no se inventan colores nuevos.
export const CUSTOM_COLOR = '#8f98a0';

export function normalizeDomain(raw) {
  let d = String(raw || '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/^www\./, '');
  return d;
}

export function allGames(catalog, settings) {
  const disabled = new Set(settings?.disabled || []);
  const custom = (settings?.customGames || []).map((g) => ({
    developer: 'Añadido por ti',
    genre: 'Trámite personalizado',
    tagline: '',
    url: `https://${g.domains[0]}/`,
    ...g,
    color: CUSTOM_COLOR,
    custom: true,
  }));
  return [...(catalog?.games || []), ...custom].map((g) => ({ ...g, enabled: !disabled.has(g.id) }));
}

export function enabledGames(catalog, settings) {
  return allGames(catalog, settings).filter((g) => g.enabled);
}

export function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

export function matchGame(url, games) {
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  // El dominio más específico gana (p. ej. dehu.redsara.es frente a un genérico redsara.es).
  let best = null;
  let bestLen = -1;
  for (const g of games) {
    for (const d of g.domains) {
      if (hostMatches(host, d) && d.length > bestLen) {
        best = g;
        bestLen = d.length;
      }
    }
  }
  return best;
}
