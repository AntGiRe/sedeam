// Utilidades compartidas por el popup y el cliente.

import { commitSegment, compareVersions, fmtDur, levelFor, migrate, sumAll, total } from './core.js';
import { resolveProfile, rewardContext, titleLabel } from './rewards.js';
import { getCatalog } from './catalog.js';
import { DEFAULT_SETTINGS } from './store.js';
import { BRAND } from '../config.js';

// Copia de los datos con la sesión en curso ya sumada, para pintar cifras al segundo
// sin esperar al siguiente apunte del service worker.
export function withLive(data, live, now = Date.now()) {
  const copy = structuredClone(data);
  if (live && now > live.start) commitSegment(copy, live.game, live.start, Math.min(now, live.start + 150_000));
  return copy;
}

export async function loadAll() {
  const [local, { live }, catalog] = await Promise.all([
    chrome.storage.local.get(['data', 'settings', 'updateStatus']),
    chrome.storage.session.get('live'),
    getCatalog(),
  ]);
  return {
    data: migrate(local.data),
    settings: { ...DEFAULT_SETTINGS, ...(local.settings || {}) },
    updateStatus: local.updateStatus || null,
    live: live || null,
    catalog,
  };
}

export function updateAvailable(status) {
  return !!status?.published && compareVersions(status.published, chrome.runtime.getManifest().version) > 0;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : String(c));
  return node;
}

// Igual que node.replaceChildren, pero ignora los huecos (null/false) de las condiciones;
// replaceChildren los escribiría como el texto "null".
export function fill(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// Carátula vertical generada a partir del color y el emoji del juego.
export function capsule(game, { mini = false, style = '' } = {}) {
  return el(
    'div',
    { class: `capsule${mini ? ' mini' : ''}`, style: `--game:${game.color};${style}`, 'aria-hidden': 'true' },
    el('span', { class: 'seal' }, BRAND.name.toUpperCase()),
    el('span', { class: 'art' }, game.emoji),
    el('span', { class: 'ttl' }, game.name, game.genre ? el('small', {}, game.genre) : null),
  );
}

// Color del anillo de nivel: cada 2 niveles cambia, como las insignias.
export function levelColor(level) {
  return ['#8f98a0', '#5aa9e6', '#1baf7a', '#9085e9', '#e87ba4', '#e8b64c'][Math.min(5, Math.floor((level - 1) / 2))];
}

export const fmtProgress = (p) =>
  p.unit === 'ms'
    ? `${fmtDur(Math.min(p.value, p.target))} / ${fmtDur(p.target)}`
    : p.unit === 'bool'
      ? ''
      : `${Math.min(p.value, p.target)} / ${p.target}${p.unit === 'days' ? ' días' : ''}`;


// Perfil visible (avatar, tema, marco, título) a partir de lo elegido y lo desbloqueado.
export function profileFor(st, data) {
  const ctx = rewardContext(data, st.catalog);
  const lv = levelFor(total(sumAll(data)), st.catalog.levels);
  const profile = resolveProfile(st.settings, st.catalog, ctx);
  profile.titleText = titleLabel(profile.title, st.catalog, ctx, lv.title);
  return { profile, ctx, lv };
}

// El tema también se guarda en localStorage para pintarlo antes de que carguen los datos (theme-boot.js).
export function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme || theme === 'sede') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem('sedeam-theme', theme || 'sede');
  } catch {
    // sin almacenamiento local: solo se pierde el pintado instantáneo
  }
}

// Rellena un .avatar (emoji + insignia de nivel) con el perfil.
export function paintAvatar(node, profile, level, playing = false) {
  const first = node.firstChild;
  if (first?.nodeType === 3) first.nodeValue = profile.avatar;
  else node.prepend(profile.avatar);
  node.querySelector('.lvl').textContent = level;
  node.style.setProperty('--lvl', levelColor(level));
  node.className = `avatar${playing ? ' playing' : ''}${profile.frame ? ` frame-${profile.frame}` : ''}`;
}

export const fmtCountdown = (days) => (days <= 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`);
