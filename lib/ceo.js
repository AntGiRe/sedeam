// Modo CEO: la vista con todo desbloqueado para quien está en la tabla `admins` de Supabase.
//
// Quién es CEO lo dice la base de datos (am_i_admin), no un email escrito en el código. Y el modo es
// solo una lente para pintar: nunca se guarda en `data` ni se sube a la nube, así que tus horas,
// logros y Wrapped siguen siendo los reales y con «Vista normal» ves lo mismo que cualquiera.

import { dayKey } from './core.js';

export const isCeo = (cloud) => cloud?.admin === true;
export const ceoOn = (cloud, settings) => isCeo(cloud) && settings?.ceoView !== false;

// Copia de los datos con todos los logros, el último rango y el pase de temporada completo.
export function ceoLens(data, catalog, now = Date.now()) {
  const achievements = { ...(data.achievements || {}) };
  for (const a of catalog.achievements || []) achievements[a.id] ||= now;
  const lastLevelXp = (catalog.levels?.at(-1)?.[0] || 0) * 60;
  const passXp = (catalog.seasons?.tiers || 30) * (catalog.seasons?.hoursPerTier || 4) * 60;
  const today = dayKey(now);
  const bonus = { ...(data.bonus || {}), [today]: (data.bonus?.[today] || 0) + lastLevelXp + passXp };
  return { ...data, achievements, bonus };
}
