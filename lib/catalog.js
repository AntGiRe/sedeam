// Catálogo de juegos, logros, niveles y novedades.
//
// Hay dos copias: la que viene dentro de la extensión (catalog.json) y la última descargada de
// GitHub (guardada en storage como remoteCatalog). Se usa la remota si es más nueva y si esta
// versión de la extensión la entiende (minAppVersion). Solo son datos: nunca se ejecuta nada remoto.

import { compareVersions } from './core.js';
import { RULE_TYPES } from './rules.js';
import { REMOTE_ENABLED, rawUrl } from '../config.js';

const HEX = /^#[0-9a-f]{6}$/i;
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

function cleanGame(g) {
  if (!g || !str(g.id, 40) || !str(g.name, 60) || !arr(g.domains).length) return null;
  const domains = g.domains.filter((d) => str(d, 100) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  if (!domains.length) return null;
  return {
    id: g.id,
    name: g.name,
    developer: str(g.developer) ? g.developer : '',
    genre: str(g.genre) ? g.genre : '',
    tagline: str(g.tagline, 300) ? g.tagline : '',
    emoji: str(g.emoji, 8) ? g.emoji : '🎮',
    color: HEX.test(g.color) ? g.color : '#8f98a0',
    url: str(g.url, 300) && /^https:\/\//.test(g.url) ? g.url : `https://${domains[0]}/`,
    domains,
  };
}

function cleanAchievement(a) {
  if (!a || !str(a.id, 40) || !str(a.name, 80) || typeof a.rule !== 'object' || !RULE_TYPES.includes(a.rule?.type)) return null;
  return {
    id: a.id,
    name: a.name,
    desc: str(a.desc, 300) ? a.desc : '',
    emoji: str(a.emoji, 8) ? a.emoji : '🏆',
    game: str(a.game, 40) ? a.game : null,
    secret: !!a.secret,
    rule: a.rule,
  };
}

// Devuelve un catálogo saneado o null si no sirve.
export function validateCatalog(c) {
  if (!c || typeof c !== 'object' || !Number.isInteger(c.catalogVersion)) return null;
  const games = arr(c.games).map(cleanGame).filter(Boolean);
  const achievements = arr(c.achievements).map(cleanAchievement).filter(Boolean);
  const levels = Array.isArray(c.levels) && c.levels.length && c.levels.every((l) => Array.isArray(l) && typeof l[0] === 'number' && str(l[1], 60)) ? c.levels : null;
  if (!games.length || !levels) return null;
  const news = arr(c.news).filter((n) => n && str(n.title, 120)).slice(0, 20);
  return { catalogVersion: c.catalogVersion, minAppVersion: c.minAppVersion || '0.0.0', updated: c.updated || '', games, achievements, levels, news };
}

export function pickCatalog(bundled, remote, appVersion) {
  const b = validateCatalog(bundled);
  const r = validateCatalog(remote);
  if (r && b && r.catalogVersion > b.catalogVersion && compareVersions(r.minAppVersion, appVersion) <= 0) return { ...r, source: 'remote' };
  return { ...b, source: 'bundled' };
}

let bundledCache = null;
export async function loadBundled() {
  bundledCache ||= await fetch(chrome.runtime.getURL('catalog.json')).then((r) => r.json());
  return bundledCache;
}

export async function getCatalog() {
  const [bundled, { remoteCatalog }] = await Promise.all([loadBundled(), chrome.storage.local.get('remoteCatalog')]);
  return pickCatalog(bundled, remoteCatalog, chrome.runtime.getManifest().version);
}

// Descarga el catálogo publicado en GitHub. Devuelve true si había uno más nuevo.
export async function refreshRemoteCatalog() {
  if (!REMOTE_ENABLED) return false;
  const res = await fetch(rawUrl('catalog.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`catálogo remoto: HTTP ${res.status}`);
  const remote = await res.json();
  if (!validateCatalog(remote)) throw new Error('catálogo remoto no válido');
  const { remoteCatalog } = await chrome.storage.local.get('remoteCatalog');
  if (remoteCatalog?.catalogVersion === remote.catalogVersion) return false;
  await chrome.storage.local.set({ remoteCatalog: remote });
  return true;
}
