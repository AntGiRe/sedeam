// Recompensas cosméticas: temas de color, avatares, marcos y títulos.
//
// No se guardan: se calculan siempre a partir de los datos (nivel, mejor nivel de temporada y logros),
// así que nunca se pierden y un catálogo nuevo puede añadir recompensas que ya tengas ganadas.

import { levelOf } from './xp.js';
import { seasonHistory } from './calendar.js';

export function rewardContext(data, catalog, now = new Date()) {
  const lv = levelOf(data, catalog.levels);
  const hist = catalog.seasons ? seasonHistory(data, catalog.seasons, now) : { best: 0, seasons: [] };
  return { level: lv.level, bestTier: hist.best, achievements: data.achievements, seasons: hist.seasons };
}

export function isUnlocked(reward, ctx) {
  const u = reward.unlock || {};
  if (u.default) return true;
  if (u.level) return ctx.level >= u.level;
  if (u.seasonTier) return ctx.bestTier >= u.seasonTier;
  if (u.achievement) return !!ctx.achievements[u.achievement];
  return false;
}

export function unlockHint(reward, catalog) {
  const u = reward.unlock || {};
  if (u.level) return `Nivel ${u.level}`;
  if (u.seasonTier) return `Nivel ${u.seasonTier} de temporada`;
  if (u.achievement) {
    const a = catalog.achievements.find((x) => x.id === u.achievement);
    return a ? (a.secret ? 'Un logro secreto' : `Logro «${a.name}»`) : 'Un logro';
  }
  return '';
}

export function unlockedIds(catalog, ctx) {
  return new Set((catalog.rewards || []).filter((r) => isUnlocked(r, ctx)).map((r) => r.id));
}

// Perfil visible: lo elegido por el usuario si lo tiene desbloqueado; si no, lo de por defecto.
export function resolveProfile(settings, catalog, ctx) {
  const rewards = catalog.rewards || [];
  const owned = unlockedIds(catalog, ctx);
  const p = settings.profile || {};
  const pick = (type, id) => {
    const r = rewards.find((x) => x.id === id && x.type === type);
    return r && owned.has(r.id) ? r : null;
  };
  const avatar = pick('avatar', p.avatar) || rewards.find((r) => r.type === 'avatar' && r.unlock?.default);
  const theme = pick('theme', p.theme) || rewards.find((r) => r.type === 'theme' && r.unlock?.default);
  const frame = pick('frame', p.frame);
  return {
    name: (p.name || '').trim() || 'Gestor/a',
    avatar: avatar?.emoji || '🧑‍💼',
    theme: theme ? theme.id.replace(/^theme-/, '') : 'sede',
    frame: frame ? frame.id.replace(/^frame-/, '') : null,
    title: p.title || null, // se resuelve en la interfaz (rango, logro o recompensa)
    showcase: (p.showcase || []).filter((id) => ctx.achievements[id]).slice(0, 3),
  };
}

// Títulos disponibles: rangos ya alcanzados, logros desbloqueados y recompensas de tipo título.
export function titleOptions(catalog, ctx) {
  const opts = [];
  catalog.levels.forEach(([, title], i) => {
    if (i + 1 <= ctx.level) opts.push({ id: `rank:${i + 1}`, label: title, group: 'Rangos' });
  });
  for (const r of catalog.rewards || []) if (r.type === 'title' && isUnlocked(r, ctx)) opts.push({ id: r.id, label: r.name, group: 'Recompensas' });
  for (const a of catalog.achievements) if (ctx.achievements[a.id]) opts.push({ id: `ach:${a.id}`, label: a.name, group: 'Logros' });
  return opts;
}

export function titleLabel(id, catalog, ctx, fallback) {
  if (!id) return fallback;
  return titleOptions(catalog, ctx).find((o) => o.id === id)?.label || fallback;
}
