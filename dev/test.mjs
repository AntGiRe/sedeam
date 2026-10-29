// Pruebas de la lógica pura: node dev/test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOUR, MIN, emptyData, migrate, commitSegment, uncommitSegment, splitByHour, streaks, levelFor, fmtHours, fmtDur, compareVersions,
} from '../lib/core.js';
import { evaluate, progress } from '../lib/rules.js';
import { matchGame, normalizeDomain, allGames } from '../lib/games.js';
import { validateCatalog, pickCatalog } from '../lib/catalog.js';
import { deadlinesBetween, upcomingDeadlines, seasonAt, seasonHistory, shiftToWorkday, daysUntil } from '../lib/calendar.js';
import { rewardContext, isUnlocked, resolveProfile, titleOptions } from '../lib/rewards.js';

const catalogJson = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url)));
const catalog = validateCatalog(catalogJson);
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
const t = (s) => new Date(s).getTime();
const dayKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let ok = 0;
const test = (name, fn) => { fn(); ok++; console.log('✓', name); };

test('el catálogo incluido es válido y no pierde nada al sanearlo', () => {
  assert.ok(catalog);
  assert.equal(catalog.games.length, catalogJson.games.length);
  assert.equal(catalog.achievements.length, catalogJson.achievements.length);
  assert.equal(new Set(catalog.achievements.map((a) => a.id)).size, catalog.achievements.length, 'ids de logro repetidos');
  for (const a of catalog.achievements) {
    assert.ok(progress(a.rule, emptyData()), `regla no entendida: ${a.id}`);
    if (a.game) assert.ok(catalog.games.some((g) => g.id === a.game), `logro ${a.id} apunta a un juego que no existe`);
  }
  assert.ok(compareVersions(catalog.minAppVersion, manifest.version) <= 0);
});

test('se usa el catálogo remoto solo si es más nuevo y compatible', () => {
  const v = manifest.version;
  const newer = { ...catalogJson, catalogVersion: catalogJson.catalogVersion + 1 };
  assert.equal(pickCatalog(catalogJson, newer, v).source, 'remote');
  assert.equal(pickCatalog(catalogJson, { ...newer, minAppVersion: '9.0.0' }, v).source, 'bundled');
  assert.equal(pickCatalog(catalogJson, { ...catalogJson }, v).source, 'bundled');
  assert.equal(pickCatalog(catalogJson, { catalogVersion: 5, games: 'basura' }, v).source, 'bundled');
  // Un logro con un tipo de regla desconocido se descarta, el resto sigue.
  const extra = validateCatalog({ ...newer, achievements: [...catalogJson.achievements, { id: 'x', name: 'X', rule: { type: 'futuro' } }] });
  assert.equal(extra.achievements.length, catalogJson.achievements.length);
  // Reglas mal escritas no rompen nada.
  for (const rule of [{ type: 'sameDay', games: 'aeat' }, { type: 'time', target: 'x' }, { type: 'streak' }]) assert.equal(progress(rule, emptyData()), null);
});

test('reconoce subdominios de cada sede y no se deja engañar', () => {
  const games = allGames(catalog, { customGames: [{ id: 'c1', name: 'ATC', emoji: '🌴', domains: ['gobiernodecanarias.org'] }] });
  const m = (u) => matchGame(u, games)?.id ?? null;
  assert.equal(m('https://sede.agenciatributaria.gob.es/Sede/iva.html'), 'aeat');
  assert.equal(m('https://www2.agenciatributaria.gob.es/wlpl/BUGC-JDIT/x'), 'aeat');
  assert.equal(m('https://portal.seg-social.gob.es/wps/portal/importass'), 'segsocial');
  assert.equal(m('https://dehu.redsara.es/'), 'dehu');
  assert.equal(m('https://sede.gobiernodecanarias.org/tributos'), 'c1');
  assert.equal(m('https://agenciatributaria.gob.es.phishing.com/'), null);
  assert.equal(m('https://notagenciatributaria.gob.es/'), null);
  assert.equal(m('chrome://extensions'), null);
  assert.equal(normalizeDomain(' https://www.Ejemplo.ES/ruta '), 'ejemplo.es');
});

test('parte el tiempo por horas y por días (medianoche)', () => {
  const parts = splitByHour(t('2026-10-28T23:50:00'), t('2026-10-29T00:10:00'));
  assert.deepEqual(parts.map((p) => [p.day, p.hour, p.ms / MIN]), [['2026-10-28', 23, 10], ['2026-10-29', 0, 10]]);
});

test('suma tiempo, sesiones continuas y récords por juego', () => {
  const d = emptyData();
  commitSegment(d, 'aeat', t('2026-10-29T09:00'), t('2026-10-29T10:00'));
  commitSegment(d, 'aeat', t('2026-10-29T10:03'), t('2026-10-29T11:00')); // pausa de 3 min: misma sesión
  assert.equal(d.days['2026-10-29'].aeat, 117 * MIN);
  assert.equal(d.slots['2026-10-29'].aeat[9], 60 * MIN);
  commitSegment(d, 'segsocial', t('2026-10-29T12:00'), t('2026-10-29T12:30'));
  assert.equal(d.run.ms, 30 * MIN);
  assert.equal(d.longestRun.ms, 117 * MIN);
  assert.deepEqual(d.bestRuns, { aeat: 117 * MIN, segsocial: 30 * MIN });
});

test('descuenta el rato de inactividad sin dejar negativos', () => {
  const d = emptyData();
  commitSegment(d, 'segsocial', t('2026-10-29T09:00'), t('2026-10-29T09:10'));
  uncommitSegment(d, 'segsocial', t('2026-10-29T09:07'), t('2026-10-29T09:10'));
  assert.equal(d.days['2026-10-29'].segsocial, 7 * MIN);
  uncommitSegment(d, 'segsocial', t('2026-10-29T08:00'), t('2026-10-29T09:30'));
  assert.equal(d.days['2026-10-29'].segsocial, 0);
});

test('migra los datos de la versión anterior sin perder nada', () => {
  const v1 = { v: 1, days: { '2026-10-28': { aeat: HOUR } }, hours: { aeat: new Array(24).fill(0) }, longestRun: { game: 'aeat', ms: HOUR, day: '2026-10-28' }, achievements: { clave: 1 }, firstPlayed: {}, lastPlayed: {} };
  const d = migrate(v1);
  assert.equal(d.v, 2);
  assert.equal(d.days['2026-10-28'].aeat, HOUR);
  assert.deepEqual(d.slots, {});
  assert.equal(d.bestRuns.aeat, HOUR);
  assert.equal(d.achievements.clave, 1);
  assert.deepEqual(migrate(undefined).days, {});
});

test('rachas: el fin de semana no rompe la racha', () => {
  const d = emptyData();
  for (const day of ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']) commitSegment(d, 'aeat', t(day + 'T10:00'), t(day + 'T11:00'));
  assert.equal(streaks(d, new Date('2026-10-27T12:00')).best, 4);
  assert.equal(streaks(d, new Date('2026-10-29T12:00')).current, 0);
});

test('logros del catálogo: se desbloquean una sola vez y con progreso', () => {
  const d = emptyData();
  commitSegment(d, 'aeat', t('2026-10-20T08:00'), t('2026-10-20T11:30')); // día 20, 3,5 h seguidas
  commitSegment(d, 'segsocial', t('2026-10-20T12:00'), t('2026-10-20T12:20'));
  commitSegment(d, 'aeat', t('2026-10-23T17:30'), t('2026-10-23T18:40')); // viernes tarde
  commitSegment(d, 'aeat', t('2026-10-20T23:10'), t('2026-10-20T23:30')); // noche
  commitSegment(d, 'segsocial', t('2026-10-27T09:00'), t('2026-10-27T11:30')); // fin de mes
  const fresh = evaluate(d, catalog.achievements, t('2026-10-28T00:00')).map((a) => a.id);
  for (const id of ['bienvenida', 'clave', 'maraton', 'dia20', 'doble', 'noctambulo', 'viernes', 'fin-de-mes']) assert.ok(fresh.includes(id), id);
  for (const id of ['jornada', 'madrugador', 'renta', 'finde']) assert.ok(!fresh.includes(id), id);
  assert.equal(evaluate(d, catalog.achievements).length, 0);
  const p = progress(catalog.achievements.find((a) => a.id === 'centenario').rule, d);
  assert.equal(p.target, 100 * HOUR);
  assert.ok(p.value > 7 * HOUR && p.value < 8 * HOUR);
});

test('niveles y formatos', () => {
  assert.equal(levelFor(0, catalog.levels).title, 'Becario');
  assert.equal(levelFor(30 * HOUR, catalog.levels).title, 'Oficial de 2ª');
  assert.equal(fmtHours(2.5 * HOUR), '2,5 h');
  assert.equal(fmtDur(192 * MIN), '3 h 12 min');
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
});

test('plazos: fechas, fin de semana y orden', () => {
  // 20 de abril de 2025 fue domingo: pasa al lunes 21.
  assert.equal(shiftToWorkday(new Date(2025, 3, 20)).getDate(), 21);
  const list = deadlinesBetween(catalog.deadlines, new Date(2026, 9, 1), new Date(2026, 9, 31)).map((d) => `${d.id}:${d.date.getDate()}`);
  assert.deepEqual(list, ['dom-tri:15', 't3:20', 'ss:30']);
  const next = upcomingDeadlines(catalog.deadlines, new Date(2026, 9, 29));
  assert.equal(next[0].id, 'ss'); // 31 oct 2026 es sábado: las cotizaciones se adelantan al viernes 30
  assert.equal(next[0].date.getDate(), 30);
  assert.equal(daysUntil(next[0].date, new Date(2026, 9, 29, 23, 0)), 1);
  assert.ok(next.some((d) => d.id === 'dom-t4') && next.some((d) => d.id === 't4'));
  // 347: último día de febrero, también en bisiesto.
  assert.equal(deadlinesBetween(catalog.deadlines, new Date(2028, 1, 1), new Date(2028, 1, 29)).find((d) => d.id === '347').date.getDate(), 29);
});

test('temporadas: límites y progreso', () => {
  const s = seasonAt(catalog.seasons, new Date(2026, 9, 29));
  assert.equal(s.id, '4T-2026');
  assert.equal(dayKeyOf(s.start), '2026-10-21');
  assert.equal(dayKeyOf(s.end), '2027-02-01'); // 30 ene 2027 es sábado
  assert.equal(seasonAt(catalog.seasons, new Date(2026, 9, 20)).id, '3T-2026');
  assert.equal(seasonAt(catalog.seasons, new Date(2027, 1, 2)).id, '1T-2027');
  assert.equal(seasonAt(catalog.seasons, new Date(2026, 5, 30)).id, '2T-2026');
  const d = emptyData();
  commitSegment(d, 'aeat', t('2026-10-21T08:00'), t('2026-10-21T17:00')); // 9 h → nivel 2 (4 h por nivel)
  commitSegment(d, 'aeat', t('2026-07-01T08:00'), t('2026-07-01T20:30')); // 12,5 h antes del 20 de julio: temporada 2T → nivel 3
  const h = seasonHistory(d, catalog.seasons, new Date(2026, 9, 29));
  assert.deepEqual(h.seasons.map((x) => [x.id, x.tier]), [['2T-2026', 3], ['3T-2026', 0], ['4T-2026', 2]]);
  assert.equal(h.best, 3);
});

test('recompensas y perfil', () => {
  const d = emptyData();
  let ctx = rewardContext(d, catalog, new Date(2026, 9, 29));
  const byId = (id) => catalog.rewards.find((r) => r.id === id);
  assert.ok(isUnlocked(byId('theme-sede'), ctx));
  assert.ok(!isUnlocked(byId('theme-papel'), ctx));
  // Elegir algo bloqueado no tiene efecto: se queda lo de por defecto.
  let p = resolveProfile({ profile: { theme: 'theme-papel', avatar: 'avatar-buho', showcase: ['clave'] } }, catalog, ctx);
  assert.equal(p.theme, 'sede');
  assert.equal(p.avatar, '🧑‍💼');
  assert.deepEqual(p.showcase, []);
  commitSegment(d, 'aeat', t('2026-10-01T00:00'), t('2026-10-02T06:00')); // 30 h → nivel 3, y de noche
  evaluate(d, catalog.achievements, t('2026-10-29T00:00'));
  ctx = rewardContext(d, catalog, new Date(2026, 9, 29));
  p = resolveProfile({ profile: { theme: 'theme-papel', avatar: 'avatar-buho', showcase: ['clave', 'noctambulo', 'no-existe'] } }, catalog, ctx);
  assert.equal(p.theme, 'papel');
  assert.equal(p.avatar, '🦉');
  assert.deepEqual(p.showcase, ['clave', 'noctambulo']);
  assert.ok(titleOptions(catalog, ctx).some((o) => o.id === 'rank:3'));
  for (const r of catalog.rewards) if (r.unlock.achievement) assert.ok(catalog.achievements.some((a) => a.id === r.unlock.achievement), r.id);
});

console.log(`\n${ok} pruebas OK`);
