// Catálogo de juegos, logros, niveles y novedades.
//
// Hay dos copias: la que viene dentro de la extensión (catalog.json, copia de respaldo) y la última
// descargada (de Supabase, donde se edita, o de GitHub si Supabase no responde), guardada en storage
// como remoteCatalog. Se usa la remota si es más nueva y si esta
// versión de la extensión la entiende (minAppVersion). Solo son datos: nunca se ejecuta nada remoto.

import { compareVersions } from './core.js';
import { RULE_TYPES } from './rules.js';
import { CLOUD_ENABLED, REMOTE_ENABLED, SUPABASE, rawUrl } from '../config.js';

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

const DAY_OK = (d) => d === 'last' || (Number.isInteger(d) && d >= 1 && d <= 31);
const MONTHS_OK = (m) => m === undefined || (Array.isArray(m) && m.length && m.every((x) => Number.isInteger(x) && x >= 1 && x <= 12));

function cleanDeadline(d) {
  if (!d || !str(d.id, 40) || !str(d.title, 120) || !DAY_OK(d.day) || !MONTHS_OK(d.months)) return null;
  return { id: d.id, title: d.title, models: str(d.models) ? d.models : '', game: str(d.game, 40) ? d.game : null, months: d.months, day: d.day, major: !!d.major, shift: d.shift === 'before' ? 'before' : 'after' };
}

function cleanSeasons(s) {
  if (!s || !Number.isFinite(s.hoursPerTier) || s.hoursPerTier <= 0 || !Number.isInteger(s.tiers) || s.tiers < 1) return null;
  const ends = arr(s.ends).filter((e) => e && str(e.quarter, 10) && Number.isInteger(e.month) && e.month >= 1 && e.month <= 12 && DAY_OK(e.day));
  if (ends.length < 2) return null;
  return { hoursPerTier: s.hoursPerTier, tiers: s.tiers, ends, names: s.names && typeof s.names === 'object' ? s.names : {} };
}

const REWARD_TYPES = ['theme', 'avatar', 'frame', 'title'];
function cleanReward(r) {
  if (!r || !str(r.id, 40) || !REWARD_TYPES.includes(r.type) || !str(r.name, 80) || !r.unlock || typeof r.unlock !== 'object') return null;
  if (r.type === 'avatar' && !str(r.emoji, 12)) return null;
  return { id: r.id, type: r.type, name: r.name, desc: str(r.desc, 200) ? r.desc : '', emoji: r.emoji || '', unlock: r.unlock };
}

function cleanLoading(l) {
  if (!l || typeof l !== 'object') return null;
  const domains = arr(l.domains).filter((d) => str(d, 100) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  const urlContains = arr(l.urlContains).filter((x) => str(x, 200));
  return domains.length || urlContains.length ? { name: str(l.name, 60) ? l.name : 'Pantallas de carga', domains, urlContains } : null;
}

function cleanInfra(x) {
  if (!x || !str(x.id, 40) || !str(x.name, 60)) return null;
  const domains = arr(x.domains).filter((d) => str(d, 100) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  return domains.length ? { id: x.id, name: x.name, emoji: str(x.emoji, 8) ? x.emoji : '🌐', domains } : null;
}

function cleanChallenge(ch) {
  if (!ch || !str(ch.id, 40) || !str(ch.name, 80) || typeof ch.rule !== 'object' || !RULE_TYPES.includes(ch.rule?.type)) return null;
  return {
    id: ch.id,
    name: ch.name,
    desc: str(ch.desc, 300) ? ch.desc : '',
    emoji: str(ch.emoji, 8) ? ch.emoji : '🎯',
    xp: Number.isFinite(ch.xp) && ch.xp > 0 && ch.xp <= 20 ? ch.xp : 2,
    mode: ch.mode === 'max' ? 'max' : 'min',
    minDays: Number.isInteger(ch.minDays) ? ch.minDays : 3,
    pool: ch.pool !== false,
    rule: ch.rule,
  };
}

// Calendario de retos: { '2026-S45': { ids: ['constante', …], note: '🚀 Arranque' } }
function cleanChallengeWeeks(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return {};
  const out = {};
  for (const [week, v] of Object.entries(w)) {
    if (!/^\d{4}-S\d{2}$/.test(week) || !v) continue;
    const ids = arr(v.ids).filter((x) => str(x, 40)).slice(0, 5);
    if (ids.length) out[week] = { ids, note: str(v.note, 60) ? v.note : '' };
  }
  return out;
}

function cleanShortcut(x) {
  if (!x || !str(x.id, 40) || !str(x.name, 40) || !str(x.url, 500) || !/^https:\/\//.test(x.url)) return null;
  return { id: x.id, name: x.name, url: x.url, emoji: str(x.emoji, 8) ? x.emoji : '🔗' };
}

// Devuelve un catálogo saneado o null si no sirve.
export function validateCatalog(c) {
  if (!c || typeof c !== 'object' || !Number.isInteger(c.catalogVersion)) return null;
  const games = arr(c.games).map(cleanGame).filter(Boolean);
  const achievements = arr(c.achievements).map(cleanAchievement).filter(Boolean);
  const levels = Array.isArray(c.levels) && c.levels.length && c.levels.every((l) => Array.isArray(l) && typeof l[0] === 'number' && str(l[1], 60)) ? c.levels : null;
  if (!games.length || !levels) return null;
  const news = arr(c.news).filter((n) => n && str(n.title, 120)).slice(0, 20);
  return {
    catalogVersion: c.catalogVersion,
    minAppVersion: c.minAppVersion || '0.0.0',
    updated: c.updated || '',
    games,
    achievements,
    levels,
    news,
    deadlines: arr(c.deadlines).map(cleanDeadline).filter(Boolean),
    seasons: cleanSeasons(c.seasons),
    rewards: arr(c.rewards).map(cleanReward).filter(Boolean),
    loading: cleanLoading(c.loading),
    infra: arr(c.infra).map(cleanInfra).filter(Boolean),
    challenges: arr(c.challenges).map(cleanChallenge).filter(Boolean),
    challengeWeeks: cleanChallengeWeeks(c.challengeWeeks),
    shortcuts: arr(c.shortcuts).map(cleanShortcut).filter(Boolean),
  };
}

export function pickCatalog(bundled, remote, appVersion) {
  const b = validateCatalog(bundled);
  const r = validateCatalog(remote);
  if (r && b && r.catalogVersion > b.catalogVersion && compareVersions(r.minAppVersion, appVersion) <= 0) return { ...r, source: remote.from || 'remote' };
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

// Descarga el catálogo publicado. Fuente principal: Supabase (get_catalog, lo que se edita en el panel).
// Si no responde, GitHub (catalog.json del repositorio). Devuelve true si había uno más nuevo.
async function fetchFromSupabase() {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/get_catalog`, {
    method: 'POST',
    cache: 'no-store',
    headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Supabase: HTTP ${res.status}`);
  return res.json();
}

async function fetchFromGitHub() {
  const res = await fetch(rawUrl('catalog.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  return res.json();
}

export async function refreshRemoteCatalog() {
  const sources = [CLOUD_ENABLED && ['supabase', fetchFromSupabase], REMOTE_ENABLED && ['github', fetchFromGitHub]].filter(Boolean);
  let remote = null;
  let from = null;
  let lastError = null;
  for (const [name, get] of sources) {
    try {
      const c = await get();
      if (validateCatalog(c)) {
        remote = c;
        from = name;
        break;
      }
      lastError = new Error('catálogo remoto no válido');
    } catch (e) {
      lastError = e;
    }
  }
  // Queda apuntado de dónde y cuándo, para enseñarlo en Ajustes.
  const status = { at: Date.now(), from, error: remote ? null : lastError?.message || null };
  if (!remote) {
    await chrome.storage.local.set({ catalogStatus: status });
    if (lastError) throw lastError;
    return false;
  }
  // Solo hacia delante: un respaldo más antiguo (p. ej. GitHub si Supabase falla) no pisa uno más nuevo.
  const { remoteCatalog } = await chrome.storage.local.get('remoteCatalog');
  if (remoteCatalog && remote.catalogVersion <= remoteCatalog.catalogVersion) {
    await chrome.storage.local.set({ catalogStatus: { ...status, from: remoteCatalog.from || from } });
    return false;
  }
  await chrome.storage.local.set({ remoteCatalog: { ...remote, from }, catalogStatus: status });
  return true;
}
