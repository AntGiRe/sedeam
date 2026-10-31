import {
  HOUR, MIN, addDays, bestDay, dayKey, fmtAgo, fmtDur, fmtHours, parseKey, streaks, sumAll, sumRange, total,
} from './lib/core.js';
import { progress } from './lib/rules.js';
import { daysUntil, seasonAt, seasonHistory, seasonProgress, upcomingDeadlines } from './lib/calendar.js';
import { isUnlocked, titleOptions, unlockHint } from './lib/rewards.js';
import { outageTotals } from './lib/extras.js';
import { DAILY_BONUS_XP, fmtXp } from './lib/xp.js';
import { challengeState, pickChallenges, weekOf } from './lib/challenges.js';
import { isYearUnlocked, latestPeriods, parsePeriod, yearUnlockDate } from './lib/wrapped.js';
import { allGames } from './lib/games.js';
import { DEFAULT_SETTINGS, saveSettings } from './lib/store.js';
import { applyTheme, capsule, el, fill, fmtCountdown, fmtProgress, levelColor, loadAll, paintAvatar, profileFor, shortcutsOf, updateAvailable, withLive } from './lib/view.js';
import { showToasts } from './lib/toast.js';
import { api, deleteMyAccount, signIn, signOut } from './lib/cloud.js';
import { SYNCED_PREFS } from './lib/cloud-core.js';
import { BRAND, CLOUD_ENABLED, REMOTE_ENABLED } from './config.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(d).toLocaleDateString('es-ES', opts);

let st = null; // { data, settings, live, catalog, updateStatus }
let data = null; // datos con la sesión en curso sumada
let games = []; // juegos visibles (activos o con horas), en orden de catálogo
let byId = {};
let range = 'week';
let offset = 0;
let achFilter = 'all';
let search = '';
let me = null; // { profile, ctx, lv }
let fresh = new Set(); // logros recién desbloqueados que aún no habías visto

// ---------- Tooltip ----------

const tip = $('tip');
function showTip(evt, content) {
  fill(tip, ...content);
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => (tip.hidden = true);
const tipRow = (color, label, value) =>
  el('div', { class: 'row' }, color ? el('span', { class: 'swatch', style: `background:${color}` }) : null, label, el('b', {}, value));

// ---------- Gráficas ----------

function niceMax(ms) {
  const h = ms / HOUR;
  if (h <= 0) return HOUR;
  if (h < 1) return Math.ceil(ms / MIN / 15) * 15 * MIN;
  // Múltiplos de 4 para que las 4 líneas de la rejilla caigan en números redondos.
  const steps = [1, 2, 4, 8, 12, 16, 20, 40, 60, 80, 100, 120, 160, 200, 400, 600, 800, 1000, 1200, 1600, 2000];
  return (steps.find((s) => s >= h) || Math.ceil(h / 400) * 400) * HOUR;
}
const axisFmt = (ms, max) => (max <= HOUR ? `${Math.round(ms / MIN)} min` : `${(ms / HOUR).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`);

// Columnas apiladas por juego. Hueco de 2px entre segmentos y extremo superior redondeado.
function columnChart(container, items, { height = 220, single = null } = {}) {
  const W = Math.max(280, container.clientWidth);
  const m = { l: 44, r: 6, t: 8, b: 24 };
  const iw = W - m.l - m.r;
  const ih = height - m.t - m.b;
  const max = niceMax(Math.max(0, ...items.map((it) => it.total)));
  const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, height, role: 'img' });

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const y = m.t + ih - (v / max) * ih;
    root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: i ? 'var(--grid)' : 'var(--axis)', 'stroke-width': 1 }));
    const t = svg('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    t.textContent = axisFmt(v, max);
    root.append(t);
  }

  const step = iw / items.length;
  const bw = Math.max(3, Math.min(32, step * 0.62));
  const hl = svg('rect', { y: m.t, height: ih, width: step, fill: 'rgba(255,255,255,0.04)', rx: 4, visibility: 'hidden' });
  root.append(hl);

  items.forEach((it, i) => {
    const cx = m.l + step * i + step / 2;
    const x = cx - bw / 2;
    let yBase = m.t + ih;
    const segs = it.segments.filter((s) => s.ms > 0);
    segs.forEach((s, j) => {
      const h = (s.ms / max) * ih;
      const gap = j ? 2 : 0;
      const hh = Math.max(0, h - gap);
      const y = yBase - gap - hh;
      if (hh > 0.5) {
        const r = j === segs.length - 1 ? Math.min(4, hh, bw / 2) : 0;
        const d = `M${x},${y + hh} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + hh} Z`;
        root.append(svg('path', { d, fill: s.color }));
      }
      yBase -= h;
    });
    if (it.label) {
      const t = svg('text', { x: cx, y: height - 6, 'text-anchor': 'middle', class: 'axis-label' });
      t.textContent = it.label;
      root.append(t);
    }
    const hit = svg('rect', { x: m.l + step * i, y: m.t, width: step, height: ih, fill: 'transparent' });
    hit.addEventListener('mousemove', (e) => {
      hl.setAttribute('x', m.l + step * i);
      hl.setAttribute('visibility', 'visible');
      const rows = single ? [tipRow(null, single, fmtDur(it.total))] : [...segs].reverse().map((s) => tipRow(s.color, s.name, fmtDur(s.ms)));
      if (!single && segs.length > 1) rows.push(el('div', { class: 'row', style: 'border-top:1px solid var(--axis);margin-top:4px;padding-top:4px' }, 'Total', el('b', {}, fmtDur(it.total))));
      if (!segs.length && !single) rows.push(el('div', { class: 'muted' }, 'Sin actividad'));
      showTip(e, [el('div', { style: 'font-weight:600;margin-bottom:4px' }, cap(it.title)), ...rows]);
    });
    hit.addEventListener('mouseleave', () => {
      hl.setAttribute('visibility', 'hidden');
      hideTip();
    });
    root.append(hit);
  });
  fill(container, root);
}

function lastDaysItems(n, gameFilter = null) {
  const today = new Date();
  return [...Array(n)].map((_, i) => {
    const d = addDays(today, i - n + 1);
    const k = dayKey(d);
    const day = data.days[k] || {};
    const list = gameFilter ? [gameFilter] : games;
    const segments = list.map((g) => ({ name: g.name, color: g.color, ms: day[g.id] || 0 }));
    return {
      label: i % 5 === 4 || i === n - 1 ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '',
      title: fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }),
      total: segments.reduce((a, s) => a + s.ms, 0),
      segments,
    };
  });
}

// ---------- Cabecera común ----------

function renderChrome() {
  const live = st.live && byId[st.live.game];
  const { profile, lv } = me;
  applyTheme(profile.theme);
  $('chip-title').textContent = profile.name;
  fill($('chip-status'), live ? el('span', { class: 'status-playing' }, `Jugando a ${live.name}`) : el('span', { class: 'rank' }, `${profile.titleText} · Nv. ${lv.level}`));
  paintAvatar($('chip-avatar'), profile, lv.level, !!live);

  const upd = updateAvailable(st.updateStatus);
  $('update-banner').hidden = !upd;
  if (upd) $('update-text').textContent = `⬇️ ${BRAND.name} ${st.updateStatus.published} está disponible (tienes la ${chrome.runtime.getManifest().version}).`;
}

// ---------- Biblioteca ----------

function gameStats(g) {
  const all = sumAll(data);
  const achs = st.catalog.achievements.filter((a) => a.game === g.id);
  return {
    ms: all[g.id] || 0,
    last: st.live?.game === g.id ? Date.now() : data.lastPlayed[g.id],
    achs,
    got: achs.filter((a) => data.achievements[a.id]).length,
  };
}

function renderSide(current) {
  const all = sumAll(data);
  const list = games.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  $('side-count').textContent = `Juegos (${list.length})`;
  if (current) $('home-link').removeAttribute('aria-current');
  else $('home-link').setAttribute('aria-current', 'page');
  fill($('side-list'), 
    ...list.map((g) => {
      const playing = st.live?.game === g.id;
      const a = el(
        'a',
        { href: `#biblioteca/${g.id}`, class: `${playing ? 'playing' : ''} ${all[g.id] ? '' : 'unplayed'}`, style: `--game:${g.color}` },
        el('span', { class: 'tile', 'aria-hidden': 'true' }, g.emoji),
        el('span', { class: 'nm' }, g.name, playing ? ' · Jugando' : ''),
        el('span', { class: 'hrs' }, all[g.id] ? fmtHours(all[g.id]) : ''),
      );
      if (current === g.id) a.setAttribute('aria-current', 'page');
      return a;
    }),
  );
}

function shelfItem(g, { recent = false } = {}) {
  const all = sumAll(data);
  const ms = all[g.id] || 0;
  const playing = st.live?.game === g.id;
  return el(
    'a',
    { class: `item${ms ? '' : ' unplayed'}`, href: `#biblioteca/${g.id}` },
    capsule(g),
    el(
      'div',
      { class: 'meta' },
      playing ? el('span', { class: 'live' }, el('span', { class: 'playing-dot' }), 'Jugando ahora') : null,
      recent && !playing ? el('span', { class: 'muted' }, `Última sesión: ${fmtAgo(data.lastPlayed[g.id])}`) : null,
      el('b', {}, ms ? `${fmtHours(ms)} registradas` : 'Sin jugar'),
    ),
  );
}

function renderLibraryHome() {
  const recent = games
    .filter((g) => data.lastPlayed[g.id] || st.live?.game === g.id)
    .sort((a, b) => (st.live?.game === b.id) - (st.live?.game === a.id) || (data.lastPlayed[b.id] || 0) - (data.lastPlayed[a.id] || 0))
    .slice(0, 3);
  const news = [...(st.catalog.news || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  const list = games.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const all = sumAll(data);

  const sb = seasonBlock();
  const next = upcomingDeadlines(st.catalog.deadlines, new Date(), { limit: 1 })[0];
  const promo = el(
    'div',
    { class: 'promo' },
    sb
      ? el(
          'a',
          { class: 'promo-card season', href: '#temporada', style: `--season:${sb.season.color}` },
          el('span', { class: 'pe', 'aria-hidden': 'true' }, sb.season.emoji),
          el('div', {}, el('div', { class: 'eyebrow' }, `Temporada ${sb.season.label} · termina ${fmtCountdown(sb.left)}`), el('b', {}, sb.season.name), el('div', { class: 'xp' }, el('i', { style: `width:${Math.round(sb.sp.progress * 100)}%` }))),
          el('div', { class: 'pt' }, el('span', {}, 'NIVEL'), el('b', {}, sb.sp.tier)),
        )
      : null,
    next
      ? el(
          'a',
          { class: `promo-card dl-card${daysUntil(next.date, new Date()) <= 3 ? ' soon' : ''}`, href: '#temporada' },
          el('span', { class: 'pe', 'aria-hidden': 'true' }, '📅'),
          el('div', {}, el('div', { class: 'eyebrow' }, `Próximo plazo · ${fmtCountdown(daysUntil(next.date, new Date()))}`), el('b', {}, next.title), el('div', { class: 'muted', style: 'font-size:12px' }, `${next.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}${next.models ? ` · ${next.models}` : ''}`)),
        )
      : null,
  );

  const shortcuts = shortcutsOf(st);
  fill($('lib-main'), 
    promo,
    shortcuts.length
      ? el('div', {}, el('div', { class: 'h-row' }, el('h2', {}, 'Accesos directos'), el('a', { class: 'muted', href: '#ajustes' }, 'Editar')), el('div', { class: 'launch' }, shortcuts.map((sc) => el('a', { href: sc.url, target: '_blank', rel: 'noopener', title: sc.url }, el('span', { 'aria-hidden': 'true' }, sc.emoji || '🔗'), sc.name))))
      : null,
    recent.length
      ? el('div', {}, el('div', { class: 'h-row' }, el('h2', {}, 'Jugados recientemente')), el('div', { class: 'shelf recent' }, recent.map((g) => shelfItem(g, { recent: true }))))
      : el('div', { class: 'card', style: 'margin-bottom:32px' }, el('h2', { style: 'font-size:16px;margin-bottom:4px' }, `Bienvenido a ${BRAND.name}`), el('p', { class: 'secondary', style: 'margin:0' }, 'Abre cualquier sede (Agencia Tributaria, Seguridad Social…) y el contador empezará solo. Tus horas aparecerán aquí.')),
    news.length
      ? el('div', {}, el('div', { class: 'h-row' }, el('h2', {}, 'Novedades')), el('div', { class: 'news' }, news.map((n) => el('article', {}, el('time', {}, n.date ? fmtDate(parseKey(n.date)) : ''), el('div', {}, el('h3', {}, n.title), n.body ? el('p', {}, n.body) : null)))))
      : null,
    el('div', { class: 'h-row' }, el('h2', {}, `Todos los juegos (${list.length})`), el('span', { class: 'muted' }, 'Ordenados por horas')),
    el('div', { class: 'shelf' }, [...list].sort((a, b) => (all[b.id] || 0) - (all[a.id] || 0)).map((g) => shelfItem(g))),
  );
}

function achRow(a, { compact = false } = {}) {
  const ts = data.achievements[a.id];
  const hidden = a.secret && !ts;
  const p = !ts && !hidden ? progress(a.rule, data) : null;
  const pct = p ? Math.min(100, (p.value / p.target) * 100) : 0;
  return el(
    'div',
    { class: `ach ${ts ? 'unlocked' : 'locked'}${fresh.has(a.id) ? ' fresh' : ''}` },
    el('div', { class: 'ico', 'aria-hidden': 'true' }, el('span', {}, hidden ? '🔒' : a.emoji)),
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'name' }, hidden ? 'Logro secreto' : a.name, fresh.has(a.id) ? el('span', { class: 'new-tag' }, 'NUEVO') : null),
      el('div', { class: 'desc' }, hidden ? 'Sigue jugando para descubrirlo.' : a.desc),
      p && p.unit !== 'bool' && !compact
        ? el('div', { class: 'prog' }, el('div', { class: 'xp' }, el('i', { style: `width:${pct}%` })), el('span', {}, fmtProgress(p)))
        : null,
    ),
    ts ? el('div', { class: 'when', title: `Desbloqueado el ${fmtDate(ts)}` }, el('b', {}, '🏆'), compact ? null : `Desbloqueado el ${fmtDate(ts)}`) : null,
  );
}

function renderGame(g) {
  const s = gameStats(g);
  const bd = bestDay(data, g.id);
  const now = new Date();
  const month = sumRange(data, dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), dayKey(now))[g.id] || 0;
  const year = sumRange(data, `${now.getFullYear()}-01-01`, dayKey(now))[g.id] || 0;
  const days = Object.values(data.days).filter((d) => (d[g.id] || 0) >= 5 * MIN).length;
  const playing = st.live?.game === g.id;
  const chart = el('div', { class: 'chart' });
  const last30 = sumRange(data, dayKey(addDays(now, -29)), dayKey(now))[g.id] || 0;
  const generic = st.catalog.achievements.filter((a) => !a.game && data.achievements[a.id]).length;

  fill($('lib-main'), 
    el(
      'div',
      { class: 'hero', style: `--game:${g.color}` },
      el('div', { class: 'bg-art', 'aria-hidden': 'true' }, g.emoji),
      el('div', { class: 'txt' }, el('div', { class: 'eyebrow', style: 'color:rgba(255,255,255,.7)' }, [g.developer, g.genre].filter(Boolean).join(' · ')), el('h1', {}, g.name), g.tagline ? el('div', { class: 'tag' }, g.tagline) : null),
    ),
    el(
      'div',
      { class: 'actionbar' },
      el('a', { class: 'btn play', href: g.url, target: '_blank', rel: 'noopener' }, playing ? 'EN PARTIDA' : '▶ JUGAR'),
      el('div', { class: 'stat' }, el('div', { class: 'eyebrow' }, 'Tiempo de juego'), el('b', {}, fmtHours(s.ms))),
      el('div', { class: 'stat' }, el('div', { class: 'eyebrow' }, 'Última sesión'), el('b', {}, playing ? 'Ahora mismo' : fmtAgo(s.last))),
      el('div', { class: 'stat' }, el('div', { class: 'eyebrow' }, 'Sesión más larga'), el('b', {}, fmtDur(data.bestRuns[g.id] || 0))),
      outageTotals(data, g.id).game ? el('div', { class: 'stat' }, el('div', { class: 'eyebrow' }, 'Caídas vistas'), el('b', {}, `💥 ${outageTotals(data, g.id).game}`)) : null,
      s.achs.length
        ? el('div', { class: 'stat' }, el('div', { class: 'eyebrow' }, 'Logros'), el('b', {}, `${s.got} / ${s.achs.length}`), el('div', { class: 'xp gold' }, el('i', { style: `width:${(s.got / s.achs.length) * 100}%` })))
        : null,
    ),
    el(
      'div',
      { class: 'detail' },
      el(
        'div',
        {},
        el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', {}, 'Actividad · últimos 30 días'), el('span', { class: 'muted' }, fmtHours(last30))), chart),
        el(
          'div',
          { class: 'card' },
          el('div', { class: 'card-head' }, el('h2', {}, 'Tus números')),
          el(
            'div',
            { class: 'records' },
            [
              ['Este mes', fmtHours(month)],
              ['Este año', fmtHours(year)],
              ['Mejor día', bd ? fmtDur(bd.ms) : '—', bd ? fmtDate(parseKey(bd.day)) : ''],
              ['Días jugados', String(days), days ? `Media: ${fmtDur(s.ms / days)} por día` : ''],
            ].map(([k, v, sub]) => el('div', { class: 'tile' }, el('div', { class: 'eyebrow' }, k), el('div', { class: 'v' }, v), sub ? el('div', { class: 's' }, sub) : null)),
          ),
        ),
      ),
      el(
        'div',
        {},
        el(
          'div',
          { class: 'card' },
          el('div', { class: 'card-head' }, el('h2', {}, 'Logros'), s.achs.length ? el('span', { class: 'muted' }, `${s.got} de ${s.achs.length}`) : null),
          s.achs.length
            ? el('div', { class: 'ach-list ach-compact' }, s.achs.map((a) => achRow(a, { compact: true })))
            : el('p', { class: 'muted', style: 'margin:0' }, `Este juego no tiene logros propios (todavía). Cuenta para los ${generic ? `${generic} logros generales que ya tienes` : 'logros generales'}.`),
          el('a', { class: 'btn', href: '#logros', style: 'margin-top:12px' }, 'Ver todos los logros'),
        ),
        el(
          'div',
          { class: 'card info' },
          el('div', { class: 'card-head' }, el('h2', {}, 'Información')),
          el('dl', {}, el('dt', {}, 'Desarrollador'), el('dd', {}, g.developer || '—'), el('dt', {}, 'Género'), el('dd', {}, g.genre || '—'), el('dt', {}, 'Webs'), el('dd', {}, g.domains.join(', ')), el('dt', {}, 'En tu biblioteca desde'), el('dd', {}, data.firstPlayed[g.id] ? fmtDate(data.firstPlayed[g.id]) : '—')),
        ),
      ),
    ),
  );
  const items = lastDaysItems(30, g);
  if (items.some((it) => it.total)) columnChart(chart, items, { height: 200, single: g.name });
  else fill(chart, el('div', { class: 'empty' }, 'Sin partidas en los últimos 30 días.'));
}

function renderLibrary(sub) {
  const g = sub && byId[sub];
  renderSide(g ? g.id : null);
  if (g) renderGame(g);
  else renderLibraryHome();
}

// ---------- Estadísticas ----------

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}

function buckets() {
  const now = new Date();
  if (range === 'week') {
    const start = addDays(mondayOf(now), offset * 7);
    const days = [...Array(7)].map((_, i) => addDays(start, i));
    return {
      label: `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`,
      items: days.map((d) => ({ label: `${WD[d.getDay()]} ${d.getDate()}`, title: fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }), from: dayKey(d), to: dayKey(d) })),
    };
  }
  if (range === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const ticks = new Set([1, 5, 10, 15, 20, 25, n]);
    return {
      label: cap(fmtDate(first, { month: 'long', year: 'numeric' })),
      items: [...Array(n)].map((_, i) => {
        const d = new Date(first.getFullYear(), first.getMonth(), i + 1);
        return { label: ticks.has(i + 1) ? String(i + 1) : '', title: fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }), from: dayKey(d), to: dayKey(d) };
      }),
    };
  }
  const y = now.getFullYear() + offset;
  return {
    label: String(y),
    items: MONTHS.map((m, i) => ({ label: m, title: fmtDate(new Date(y, i, 1), { month: 'long', year: 'numeric' }), from: dayKey(new Date(y, i, 1)), to: dayKey(new Date(y, i + 1, 0)) })),
  };
}

function renderStatTiles() {
  const grand = total(sumAll(data));
  const now = new Date();
  const today = dayKey(now);
  const tiles = [
    ['Hoy', total(data.days[today] || {}), cap(fmtDate(now, { weekday: 'long', day: 'numeric' }))],
    ['Esta semana', total(sumRange(data, dayKey(mondayOf(now)), today)), 'desde el lunes'],
    ['Este mes', total(sumRange(data, dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), today)), cap(fmtDate(now, { month: 'long' }))],
    ['Este año', total(sumRange(data, `${now.getFullYear()}-01-01`, today)), String(now.getFullYear())],
    ['Total', grand, 'desde que llevas la cuenta'],
  ];
  fill($('tiles'), ...tiles.map(([k, ms, sub]) => el('div', { class: 'tile' }, el('div', { class: 'eyebrow' }, k), el('div', { class: 'v' }, ms >= HOUR ? fmtHours(ms) : fmtDur(ms)), el('div', { class: 's' }, sub))));
}

function renderActivity() {
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
  $('next').disabled = offset >= 0;
  const b = buckets();
  $('period-label').textContent = b.label;
  const items = b.items.map((it) => {
    const sums = sumRange(data, it.from, it.to);
    return { ...it, segments: games.map((g) => ({ name: g.name, color: g.color, ms: sums[g.id] || 0 })), total: total(sums) };
  });
  const periodTotal = items.reduce((a, it) => a + it.total, 0);
  if (!periodTotal) fill($('chart'), el('div', { class: 'empty' }, 'Sin actividad en este periodo. Hacienda te echa de menos.'));
  else columnChart($('chart'), items);

  // Tabla de totales: hace de leyenda y de vista en tabla del gráfico.
  const sums = sumRange(data, b.items[0].from, b.items[b.items.length - 1].to);
  const rows = games.filter((g) => sums[g.id] > 0).sort((a, z) => sums[z.id] - sums[a.id]);
  const max = Math.max(1, ...rows.map((g) => sums[g.id]));
  fill($('totals'), 
    ...rows.map((g) =>
      el(
        'div',
        { class: 'trow' },
        el('span', { class: 'swatch', style: `background:${g.color}` }),
        el('span', {}, `${g.emoji} ${g.name}`),
        el('div', { class: 'bar' }, el('i', { style: `width:${(sums[g.id] / max) * 100}%;background:${g.color}` })),
        el('span', { class: 'val' }, fmtDur(sums[g.id])),
        el('span', { class: 'pct' }, `${Math.round((sums[g.id] / periodTotal) * 100)}%`),
      ),
    ),
    rows.length > 1 ? el('div', { class: 'trow sum' }, el('span'), el('span', {}, 'Total'), el('span', { class: 'bar', style: 'background:none' }), el('span', { class: 'val' }, fmtDur(periodTotal)), el('span')) : null,
  );
}

// Calendario de calor: rampa secuencial de un solo azul, con cortes fijos y legibles.
const HEAT = [
  [0, 'var(--surface-3)', 'Nada'],
  [1, '#104281', '<30 min'],
  [30 * MIN, '#1c5cab', '30 min–2 h'],
  [2 * HOUR, '#2a78d6', '2–4 h'],
  [4 * HOUR, '#5598e7', '4–6 h'],
  [6 * HOUR, '#9ec5f4', '+6 h'],
];
const heatColor = (ms) => [...HEAT].reverse().find(([t]) => ms >= t)[1];

function renderHeat() {
  const cell = 13;
  const gap = 3;
  const today = new Date();
  const start = addDays(mondayOf(today), -52 * 7);
  const weeks = 53;
  const top = 18;
  const left = 22;
  const W = left + weeks * (cell + gap);
  const H = top + 7 * (cell + gap);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Actividad diaria del último año' });
  ['L', '', 'X', '', 'V', '', 'D'].forEach((l, i) => {
    if (!l) return;
    const t = svg('text', { x: 0, y: top + i * (cell + gap) + cell - 2, class: 'axis-label' });
    t.textContent = l;
    root.append(t);
  });
  let lastMonth = -1;
  let yearTotal = 0;
  let active = 0;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > today) continue;
      if (d === 0 && date.getMonth() !== lastMonth && date.getDate() <= 7) {
        lastMonth = date.getMonth();
        const t = svg('text', { x: left + w * (cell + gap), y: 11, class: 'axis-label' });
        t.textContent = MONTHS[lastMonth];
        root.append(t);
      }
      const k = dayKey(date);
      const ms = total(data.days[k] || {});
      yearTotal += ms;
      if (ms >= 5 * MIN) active++;
      const r = svg('rect', { x: left + w * (cell + gap), y: top + d * (cell + gap), width: cell, height: cell, rx: 2, fill: heatColor(ms) });
      r.addEventListener('mousemove', (e) => {
        const g = data.days[k] || {};
        const rows = games.filter((x) => g[x.id] > 0).map((x) => tipRow(x.color, x.name, fmtDur(g[x.id])));
        showTip(e, [el('div', { style: 'font-weight:600;margin-bottom:4px' }, cap(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))), ...(rows.length ? rows : [el('div', { class: 'muted' }, 'Sin actividad')])]);
      });
      r.addEventListener('mouseleave', hideTip);
      root.append(r);
    }
  }
  fill($('heat'), root);
  $('heat-sub').textContent = `${fmtHours(yearTotal)} en ${active} días`;
  fill($('heat-legend'), ...HEAT.flatMap(([, c, l]) => [el('span', { class: 'sw', style: `background:${c}` }), el('span', { class: 't' }, l)]));
}

function renderHours() {
  const sums = new Array(24).fill(0);
  for (const arr of Object.values(data.hours)) arr.forEach((ms, h) => (sums[h] += ms));
  if (!total(sums)) {
    fill($('hours'), el('div', { class: 'empty' }, 'Aún no hay datos.'));
    return;
  }
  const items = sums.map((ms, h) => ({
    label: h % 3 === 0 ? `${h}h` : '',
    title: `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`,
    total: ms,
    segments: [{ name: 'Tiempo', color: '#3987e5', ms }],
  }));
  columnChart($('hours'), items, { height: 200, single: 'Tiempo total' });
}

function renderRecords() {
  const bd = bestDay(data);
  const lr = data.longestRun;
  const s = streaks(data);
  const all = sumAll(data);
  const fav = games.filter((g) => all[g.id]).sort((a, z) => all[z.id] - all[a.id])[0];
  const daysActive = Object.keys(data.days).filter((k) => total(data.days[k]) >= 5 * MIN).length;
  const lrGame = lr && byId[lr.game];
  const rec = [
    ['Día más largo', bd ? fmtDur(bd.ms) : '—', bd ? fmtDate(parseKey(bd.day)) : ''],
    ['Sesión más larga', lr?.ms ? fmtDur(lr.ms) : '—', lr?.ms ? `${lrGame?.name || lr.game} · ${fmtDate(parseKey(lr.day))}` : ''],
    ['Racha actual', `${s.current} días`, `Mejor: ${s.best} días laborables`],
    ['Juego favorito', fav ? fav.name : '—', fav ? fmtHours(all[fav.id]) : ''],
    ['Días con actividad', String(daysActive), daysActive ? `Media: ${fmtDur(total(all) / daysActive)} por día` : ''],
    ['Logros', `${unlockedCount()}/${st.catalog.achievements.length}`, 'Pestaña Logros'],
  ];
  fill($('records'), ...rec.map(([k, v, sub]) => el('div', { class: 'tile' }, el('div', { class: 'eyebrow' }, k), el('div', { class: 'v' }, v), el('div', { class: 's' }, sub))));
}

function renderWrapLinks() {
  const now = new Date();
  const thisMonth = dayKey(now).slice(0, 7);
  const [last] = latestPeriods(now).filter((x) => x.length === 7);
  const y = now.getFullYear();
  const open = isYearUnlocked(y, now);
  const days = Math.ceil((yearUnlockDate(y) - now) / 86_400_000);
  const hasPrevYear = Object.keys(data.days).some((k) => k.startsWith(String(y - 1)));
  const link = (href, text, primary, title) => el('a', { class: `btn${primary ? ' primary' : ''}`, href, target: '_blank', title }, text);
  fill(
    $('wrap-actions'),
    // El del año manda desde la segunda semana de diciembre; antes, cuenta atrás.
    open ? link(`wrapped.html?periodo=${y}`, `🎁 Wrapped ${y}`, true) : null,
    link(`wrapped.html?periodo=${last}`, `Wrapped de ${parsePeriod(last).name}`, !open),
    link(`wrapped.html?periodo=${thisMonth}`, `${cap(parsePeriod(thisMonth).name)} hasta hoy`),
    !open ? link(`wrapped.html?periodo=${y}`, `🔒 ${y} · en ${days} ${days === 1 ? 'día' : 'días'}`, false, `Se desbloquea el ${yearUnlockDate(y).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`) : null,
    hasPrevYear && !open ? link(`wrapped.html?periodo=${y - 1}`, `Año ${y - 1}`) : null,
    link(`report.html?mes=${thisMonth}`, '📄 Informe mensual'),
  );
}

// Pantallas de carga, caídas y pestañas: lo que nadie cuenta.
function renderNomina() {
  const now = new Date();
  const monthStart = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const loadTotal = Object.values(data.loading).reduce((a, b) => a + b, 0);
  const loadMonth = Object.entries(data.loading).filter(([k]) => k >= monthStart).reduce((a, [, v]) => a + v, 0);
  const out = outageTotals(data);
  const outMonth = Object.entries(data.outages).filter(([k]) => k >= monthStart).reduce((a, [, d]) => a + total(d), 0);
  const perGame = {};
  for (const day of Object.values(data.outages)) for (const [g, n] of Object.entries(day)) perGame[g] = (perGame[g] || 0) + n;
  const worst = Object.entries(perGame).sort((a, b) => b[1] - a[1])[0];
  const nameOf = (id) => byId[id]?.name || (st.catalog.infra || []).find((x) => x.id === id)?.name || id;
  const tabsAll = data.tabs.all;
  const bestGameTabs = Object.entries(data.tabs.byGame).sort((a, b) => b[1].count - a[1].count)[0];
  const card = (ico, label, v, sub, joke) => el('div', { class: 'nm-card' }, el('div', { class: 'big-ico', 'aria-hidden': 'true' }, ico), el('div', { class: 'eyebrow' }, label), el('div', { class: 'v' }, v), el('div', { class: 's' }, sub), joke ? el('div', { class: 'joke' }, joke) : null);
  const loadJoke = loadTotal >= 3600_000 ? `Con ese tiempo te daba para ver ${Math.floor(loadTotal / (110 * 60_000))} películas.` : loadTotal ? 'Cada vez que entras, Cl@ve te pregunta quién eres. Filosófico.' : 'Aún no has tenido que demostrar que eres tú. Disfrútalo.';
  const infoOf = (id) => byId[id] || (st.catalog.infra || []).find((x) => x.id === id) || { name: id, emoji: '🌐' };
  const ranking = Object.entries(perGame).sort((a, b) => b[1] - a[1]);
  fill(
    $('nomina'),
    card('⏳', 'Pantallas de carga', fmtDur(loadTotal), `Identificándote con Cl@ve · ${fmtDur(loadMonth)} este mes`, loadJoke),
    card('💥', 'Caídas de la sede', `${out.all}`, `${outMonth} este mes${worst ? ` · la que más: ${nameOf(worst[0])} (${worst[1]})` : ''}`, out.all ? (out.all >= 10 ? '«Servicio temporalmente no disponible» ya es tu canción favorita.' : 'Error 500: el código postal de la paciencia.') : 'Ninguna caída registrada. Sospechoso.'),
    card('🤹', 'Récord de pestañas', tabsAll ? `${tabsAll.count}` : '—', tabsAll ? `a la vez, el ${fmtDate(tabsAll.ts)}${bestGameTabs ? ` · de una sola sede: ${bestGameTabs[1].count} (${byId[bestGameTabs[0]]?.name || bestGameTabs[0]})` : ''}` : 'Abre varias pestañas de sedes y verás', tabsAll && tabsAll.count >= 8 ? 'Tu navegador te pide un aumento de sueldo.' : null),
    ranking.length
      ? el('div', { class: 'nm-rank' }, el('span', { class: 'eyebrow' }, 'Caídas por web'), ranking.map(([id, n]) => el('span', { class: 'chip' }, `${infoOf(id).emoji} ${infoOf(id).name}`, el('b', {}, n))))
      : null,
  );
}

// ---------- Logros ----------

const unlockedCount = () => st.catalog.achievements.filter((a) => data.achievements[a.id]).length;

function renderAchievements() {
  const list = st.catalog.achievements;
  const n = unlockedCount();
  $('ach-count').textContent = `${n} / ${list.length}`;
  $('ach-bar').style.width = `${(n / list.length) * 100}%`;
  $('ach-pct').textContent = `${Math.round((n / list.length) * 100)} %`;

  const filters = [
    ['all', 'Todos'],
    ['got', 'Desbloqueados'],
    ['todo', 'Pendientes'],
    ['general', 'Generales'],
    ...games.filter((g) => list.some((a) => a.game === g.id)).map((g) => [g.id, g.name]),
  ];
  fill($('ach-filter'), 
    ...filters.map(([id, label]) =>
      el('button', { 'aria-pressed': String(achFilter === id), onclick: () => { achFilter = id; renderAchievements(); } }, label),
    ),
  );
  const pass = (a) =>
    achFilter === 'all' ? true
      : achFilter === 'got' ? !!data.achievements[a.id]
        : achFilter === 'todo' ? !data.achievements[a.id]
          : achFilter === 'general' ? !a.game
            : a.game === achFilter;
  // Desbloqueados primero (los más recientes arriba); luego los pendientes, los más avanzados antes.
  const score = (a) => {
    if (data.achievements[a.id]) return 2 + data.achievements[a.id] / 1e13;
    if (a.secret) return -1;
    const p = progress(a.rule, data);
    return p ? Math.min(1, p.value / p.target) : 0;
  };
  const shown = list.filter(pass).sort((a, b) => score(b) - score(a));
  fill($('ach-list'), ...(shown.length ? shown.map((a) => achRow(a)) : [el('div', { class: 'empty' }, 'Nada por aquí.')]));
  // Al ver la pestaña de logros, los nuevos dejan de serlo (pero siguen marcados mientras estés aquí).
  if (st.unseen.length) chrome.storage.local.set({ unseen: [] });
}

// ---------- Temporada ----------

const REWARD_ICON = { theme: '🎨', frame: '🖼️', title: '🏷️' };
const rewardIcon = (r) => (r.type === 'avatar' ? r.emoji : REWARD_ICON[r.type] || '🎁');
const rewardKind = { theme: 'Tema', avatar: 'Avatar', frame: 'Marco', title: 'Título' };

function seasonBlock() {
  const cfg = st.catalog.seasons;
  if (!cfg) return null;
  const now = new Date();
  const season = seasonAt(cfg, now);
  return { cfg, season, sp: seasonProgress(data, cfg, season), left: daysUntil(season.end, now) };
}

function renderSeason() {
  const b = seasonBlock();
  if (!b) {
    fill($('season-hero'), el('div', {}, 'Este catálogo no trae temporadas.'));
    return;
  }
  const { cfg, season, sp, left } = b;
  const fmtD = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  $('season-hero').style.setProperty('--season', season.color);
  fill(
    $('season-hero'),
    el('div', { class: 'big-emoji', 'aria-hidden': 'true' }, season.emoji),
    el(
      'div',
      {},
      el('div', { class: 'eyebrow', style: 'color:rgba(255,255,255,.7)' }, `Temporada ${season.label}`),
      el('h1', {}, season.name),
      el('div', { class: 'meta' }, `${fmtD(season.start)} – ${fmtD(season.end)} · termina ${fmtCountdown(left)}`),
      el('div', { class: 'xp' }, el('i', { style: `width:${Math.round(sp.progress * 100)}%` })),
      el('div', { class: 'meta xp-now' }, sp.maxed ? '¡Pase completado! 🥇' : el('span', {}, el('b', {}, `${sp.xpInTier} / ${fmtXp(sp.xpPerTier)}`), ` → nivel ${sp.tier + 1}`)),
    ),
    el('div', { class: 'tier-ring', style: `--p:${(sp.tier / cfg.tiers) * 100}` }, el('div', {}, el('span', {}, 'NIVEL'), el('b', {}, String(sp.tier)), el('span', {}, `DE ${cfg.tiers}`))),
  );

  renderHowTo(cfg);
  renderChallenges();

  // Pista del pase: un hueco por nivel, con su recompensa si la tiene.
  const byTier = {};
  for (const r of st.catalog.rewards || []) if (r.unlock?.seasonTier) (byTier[r.unlock.seasonTier] ||= []).push(r);
  const best = me.ctx.bestTier;
  $('pass-sub').textContent = `${fmtXp(cfg.hoursPerTier * 60)} por nivel · lo que ganas es tuyo para siempre${best ? ` · tu récord: nivel ${best}` : ''}`;
  const cells = [];
  for (let n = 1; n <= cfg.tiers; n++) {
    const rs = byTier[n] || [];
    const done = sp.tier >= n;
    const medal = n === 5 ? '🥉' : n === 15 ? '🥈' : n === cfg.tiers ? '🥇' : null;
    cells.push(
      el(
        'div',
        { class: `tier${rs.length || medal ? ' reward' : ''}${done ? ' done' : ''}${sp.tier + 1 === n ? ' current' : ''}`, title: rs.map((r) => `${rewardKind[r.type]}: ${r.name}`).join('\n') || undefined },
        el('div', { class: 'n' }, n),
        el('div', { class: 'r', 'aria-hidden': 'true' }, rs.length ? rewardIcon(rs[0]) : medal || '·'),
        el('div', { class: 'lbl' }, rs.length ? rs.map((r) => r.name).join(' + ') : medal ? 'Insignia de temporada' : ''),
      ),
    );
  }
  fill($('pass'), cells);
  const cur = $('pass').children[Math.min(cfg.tiers - 1, sp.tier)];
  if (cur) $('pass').scrollLeft = Math.max(0, cur.offsetLeft - $('pass').clientWidth / 2);

  const now = new Date();
  fill(
    $('deadlines'),
    // Cada plazo recurrente una sola vez (su próxima fecha), para que las cotizaciones mensuales no lo llenen todo.
    upcomingDeadlines(st.catalog.deadlines, now, { limit: 40, horizon: 400 }).filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i).slice(0, 8).map((d) => {
      const days = daysUntil(d.date, now);
      return el(
        'div',
        { class: `dl${days <= 3 ? ' soon' : ''}${d.major ? ' major' : ''}` },
        el('div', { class: 'date' }, el('b', {}, d.date.getDate()), el('span', {}, MONTHS[d.date.getMonth()])),
        el('div', {}, el('div', { class: 't' }, `${byId[d.game]?.emoji || '📅'} ${d.title}`), d.models ? el('div', { class: 'm' }, d.models) : null),
        el('div', { class: 'cd' }, fmtCountdown(days)),
      );
    }),
  );

  const hist = seasonHistory(data, cfg, now).seasons.reverse();
  fill(
    $('season-list'),
    hist.length
      ? hist.map((x) =>
          el(
            'div',
            { class: 'srow' },
            el('div', { class: 'e', 'aria-hidden': 'true' }, x.emoji),
            el('div', {}, el('b', {}, `${x.label} · ${x.name}`), el('div', { class: 'sub' }, `${fmtHours(x.ms)}${x.id === season.id ? ' · en curso' : ''}`)),
            el('div', { class: 'tierv' }, `Nv. ${x.tier}`),
            el('div', { class: 'medal' }, x.tier >= cfg.tiers ? '🥇' : x.tier >= 15 ? '🥈' : x.tier >= 5 ? '🥉' : ''),
          ),
        )
      : el('div', { class: 'empty' }, 'Tu primera temporada empieza en cuanto entres en una sede.'),
  );
}

// Cómo se gana XP, en cuatro iconos.
function renderHowTo(cfg) {
  const xps = (st.catalog.challenges || []).map((c) => c.xp * 60);
  const tile = (e, big, small) => el('div', { class: 'how' }, el('span', { class: 'e', 'aria-hidden': 'true' }, e), el('b', {}, big), el('span', {}, small));
  fill(
    $('howto'),
    tile('⏱️', '1 XP por minuto', 'en cualquier sede'),
    tile('☀️', `+${DAILY_BONUS_XP} XP`, 'primer fichaje del día'),
    xps.length ? tile('🎯', `+${Math.min(...xps)}–${Math.max(...xps)} XP`, 'por reto semanal') : null,
    tile('🏅', `${cfg.hoursPerTier * 60} XP = 1 nivel`, `de temporada · ${cfg.tiers} niveles`),
  );
}

function renderChallenges() {
  const now = new Date();
  const week = weekOf(now);
  const chs = pickChallenges(st.catalog.challenges || [], week.id, 3, st.catalog.challengeWeeks);
  const theme = st.catalog.challengeWeeks?.[week.id]?.note;
  const completed = Object.values(data.challenges || {}).reduce((a, w) => a + Object.keys(w).length, 0);
  const left = daysUntil(week.end, now);
  $('ch-sub').textContent = `Semana ${week.id.split('-S')[1]} · ${left <= 0 ? 'último día' : `quedan ${left + 1} días`} · ${completed} retos completados en total`;
  $('ch-theme').hidden = !theme;
  $('ch-theme').textContent = theme || '';
  fill(
    $('challenges'),
    chs.length
      ? chs.map((ch) => {
          const s = challengeState(ch, data, week, now);
          if (!s) return null;
          const val = s.unit === 'ms' ? `${fmtDur(s.value)} / ${fmtDur(s.target)}` : s.unit === 'bool' ? '' : `${Math.min(s.value, s.target)} / ${s.target}`;
          const tag = s.done ? '✓ Completado' : s.failed ? '✗ Fallido' : ch.mode === 'max' ? `Se resuelve el domingo · ${s.daysActive}/${ch.minDays} días` : 'En curso';
          return el(
            'div',
            { class: `ch${s.done ? ' done' : ''}${s.failed ? ' failed' : ''}` },
            el('div', { class: 'top' }, el('span', { class: 'e', 'aria-hidden': 'true' }, ch.emoji), el('div', {}, el('div', { class: 'nm' }, ch.name), el('div', { class: 'xpv' }, `+${fmtXp(ch.xp * 60)}${ch.mode === 'max' ? ' · contención' : ''}`))),
            el('div', { class: 'd' }, ch.desc),
            s.unit !== 'bool' ? el('div', { class: `xp${ch.mode === 'max' ? ' warn' : ''}` }, el('i', { style: `width:${Math.round((s.done && ch.mode !== 'max' ? 1 : s.pct) * 100)}%` })) : null,
            el('div', { class: 'foot' }, el('span', {}, ch.mode === 'max' ? `Llevas ${val.split(' / ')[0]} (máx. ${val.split(' / ')[1]})` : val), el('span', { class: 'tag' }, tag)),
          );
        })
      : el('div', { class: 'empty' }, 'Este catálogo no trae retos.'),
  );
}

// ---------- Perfil ----------

async function updateProfile(patch) {
  await updateSettings({ profile: { ...(st.settings.profile || {}), ...patch } });
}

const THEME_SW = {
  sede: ['#0e141c', '#151e29', '#5aa9e6', '#0a0f15'],
  papel: ['#efe6d2', '#f8f1e1', '#b06d1e', '#3a2c1a'],
  boe: ['#f4f4f2', '#ffffff', '#333333', '#111111'],
  oro: ['#12100a', '#1c1810', '#e8b64c', '#0a0905'],
  cierre: ['#150b0e', '#21121a', '#ff7a7a', '#0d0608'],
  renta: ['#0c1510', '#122019', '#6cc644', '#070d09'],
};
let showcaseEditing = false;

function renderProfilePage() {
  const { profile, ctx, lv } = me;
  const all = sumAll(data);
  const cfg = st.catalog.seasons;
  const live = st.live && byId[st.live.game];
  const season = cfg ? seasonAt(cfg, new Date()) : null;
  const firstPlayed = Object.values(data.firstPlayed).filter(Boolean).sort((a, b) => a - b)[0];

  // Cabecera: avatar, nombre, título, estado y nivel tipo Steam.
  const avatar = el('div', { class: 'avatar', 'aria-hidden': 'true' }, profile.avatar, el('span', { class: 'lvl' }, lv.level));
  paintAvatar(avatar, profile, lv.level, !!live);
  if (season) $('pf-hero').style.setProperty('--season', season.color);
  fill(
    $('pf-hero'),
    avatar,
    el(
      'div',
      { style: 'min-width:0' },
      el('div', { class: 'pname' }, profile.name),
      el('div', { class: 'ptitle' }, profile.titleText),
      el(
        'div',
        { class: 'pstatus' },
        live ? el('span', { class: 'status-playing' }, `● Jugando a ${live.name}`) : el('span', { style: 'color:rgba(255,255,255,.65)' }, firstPlayed ? `En ${BRAND.name} desde ${fmtDate(firstPlayed, { month: 'long', year: 'numeric' })}` : `Recién llegado a ${BRAND.name}`),
        CLOUD_ENABLED
          ? st.account
            ? el('a', { class: 'cloud-link', href: '#ajustes' }, `☁️ Sincronizado en ${Math.max(1, (st.cloud?.devices || []).length)} ${(st.cloud?.devices || []).length > 1 ? 'PCs' : 'PC'}`)
            : el('a', { class: 'cloud-link', href: '#ajustes' }, '☁️ Guarda tu perfil en la nube →')
          : null,
      ),
      el('button', { class: 'edit', onclick: openEdit }, '✏️ Editar perfil'),
    ),
    el(
      'div',
      { class: 'lvl-big', style: `--lvl:${levelColor(lv.level)}` },
      el('div', { class: 'ring', style: `--p:${Math.round(lv.progress * 100)}` }, el('div', {}, el('span', {}, 'NIVEL'), el('b', {}, lv.level))),
      el('small', {}, lv.nextTitle ? `${fmtXp(lv.xpToNext)} para ${lv.nextTitle}` : 'Rango máximo'),
    ),
  );

  // Vitrina: 3 medallas; al editar, se eligen tocando los logros desbloqueados.
  const got = st.catalog.achievements.filter((a) => data.achievements[a.id]);
  const chosen = [...profile.showcase];
  fill(
    $('showcase'),
    [0, 1, 2].map((i) => {
      const a = st.catalog.achievements.find((x) => x.id === chosen[i]);
      return el(
        'div',
        { class: `slot${a ? '' : ' empty'}` },
        el('div', { class: 'ico', 'aria-hidden': 'true' }, a ? a.emoji : '＋'),
        el('div', { class: 'nm' }, a ? a.name : 'Hueco libre'),
        a ? el('div', { class: 'muted', style: 'font-size:12px' }, a.desc) : null,
      );
    }),
  );
  $('showcase-edit').textContent = showcaseEditing ? 'Hecho' : 'Editar vitrina';
  $('showcase-pick').hidden = !showcaseEditing;
  if (showcaseEditing) {
    fill(
      $('showcase-pick'),
      el('div', { class: 'count' }, got.length ? `Elige hasta 3 · ${chosen.length}/3` : 'Aún no tienes logros que enseñar.'),
      got.map((a) => el('button', {
        title: a.name,
        'aria-pressed': String(chosen.includes(a.id)),
        onclick: () => {
          const next = chosen.includes(a.id) ? chosen.filter((x) => x !== a.id) : [...chosen, a.id].slice(-3);
          updateProfile({ showcase: next });
        },
      }, a.emoji)),
    );
  }

  // Sedes favoritas (top 3 por horas) y actividad reciente.
  const favs = games.filter((g) => all[g.id]).sort((a, b) => all[b.id] - all[a.id]).slice(0, 3);
  fill(
    $('pf-favs'),
    favs.length
      ? favs.map((g) => el('a', { href: `#biblioteca/${g.id}` }, capsule(g), el('div', { class: 'meta' }, el('b', {}, g.name), fmtHours(all[g.id]))))
      : el('p', { class: 'muted', style: 'margin:0' }, 'Entra en alguna sede y aparecerán aquí.'),
  );
  const two = sumRange(data, dayKey(addDays(new Date(), -13)), dayKey(new Date()));
  $('pf-recent-sub').textContent = `${fmtHours(total(two))} en las últimas 2 semanas`;
  const recent = games.filter((g) => data.lastPlayed[g.id]).sort((a, b) => data.lastPlayed[b.id] - data.lastPlayed[a.id]).slice(0, 4);
  fill(
    $('pf-recent'),
    recent.length
      ? recent.map((g) => el('a', { href: `#biblioteca/${g.id}` }, capsule(g, { mini: true }), el('div', {}, el('b', {}, g.name), el('small', {}, `Última sesión: ${fmtAgo(st.live?.game === g.id ? Date.now() : data.lastPlayed[g.id])}`)), el('div', { class: 'h' }, fmtHours(two[g.id] || 0), el('small', {}, '2 semanas'))))
      : el('p', { class: 'muted', style: 'margin:0' }, 'Sin actividad todavía.'),
  );

  // Columna lateral
  fill(
    $('pf-level'),
    el('h3', {}, 'Experiencia'),
    el('div', { class: 'side-xp' }, el('div', { class: 'big' }, fmtXp(lv.xp)), el('div', { class: 'xp' }, el('i', { style: `width:${Math.round(lv.progress * 100)}%` })), el('div', { class: 'muted', style: 'font-size:12px' }, lv.nextTitle ? `Nivel ${lv.level} · ${fmtXp(lv.xpInLevel)} / ${fmtXp(lv.xpForLevel)}` : `Nivel ${lv.level} · rango máximo`)),
  );
  const nAch = got.length;
  const lastAch = [...got].sort((a, b) => data.achievements[b.id] - data.achievements[a.id]).slice(0, 6);
  fill(
    $('pf-ach'),
    el('h3', {}, 'Logros'),
    el('div', { class: 'side-xp' }, el('div', { class: 'big' }, `${nAch} / ${st.catalog.achievements.length}`), el('div', { class: 'xp gold' }, el('i', { style: `width:${(nAch / st.catalog.achievements.length) * 100}%` }))),
    lastAch.length ? el('div', { class: 'ach-mini' }, lastAch.map((a) => el('span', { title: a.name }, a.emoji))) : null,
    el('a', { class: 'btn ghost', href: '#logros', style: 'margin-top:10px' }, 'Ver todos'),
  );
  const hist = cfg ? seasonHistory(data, cfg).seasons.filter((x) => x.tier >= 5).reverse() : [];
  fill(
    $('pf-badges'),
    el('h3', {}, 'Insignias de temporada'),
    hist.length
      ? el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, hist.slice(0, 8).map((x) => el('div', { class: 'sbadge', style: `--season:${x.color}`, title: `${x.label} · ${x.name} · nivel ${x.tier}` }, el('div', {}, x.tier >= cfg.tiers ? '🥇' : x.tier >= 15 ? '🥈' : '🥉'), x.label)))
      : el('p', { class: 'muted', style: 'margin:0;font-size:12px' }, 'Llega al nivel 5 de una temporada para ganar tu primera insignia.'),
  );
  const s = streaks(data);
  const facts = [
    ['Horas en sedes', fmtHours(total(all))],
    ['Sedes jugadas', String(Object.values(all).filter((ms) => ms > 0).length)],
    ['Racha actual', `${s.current} días`],
    ['Mejor racha', `${s.best} días`],
    ['Mejor temporada', `Nivel ${ctx.bestTier}`],
  ];
  fill($('pf-facts'), el('h3', {}, 'En cifras'), el('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));

  if ($('pf-edit').open) renderEdit();
}

// ---------- Panel «Editar perfil» ----------

let editTab = 'general';

function openEdit() {
  renderEdit();
  $('pf-edit').showModal();
}

function renderEdit() {
  const { profile, ctx, lv } = me;
  for (const b of document.querySelectorAll('[data-ptab]')) b.setAttribute('aria-selected', String(b.dataset.ptab === editTab));
  for (const p of document.querySelectorAll('.pf-pane')) p.hidden = p.dataset.pane !== editTab;

  if (document.activeElement !== $('p-name')) $('p-name').value = (st.settings.profile || {}).name || '';
  const titles = titleOptions(st.catalog, ctx);
  const groups = [...new Set(titles.map((t) => t.group))];
  fill(
    $('pick-title'),
    el('option', { value: '' }, `Automático (${lv.title})`),
    groups.map((g) => el('optgroup', { label: g }, titles.filter((t) => t.group === g).map((t) => el('option', { value: t.id, selected: t.id === profile.title }, t.label)))),
  );

  const rewards = st.catalog.rewards || [];
  const pickBtn = (r, content, cls, current) => {
    const open = isUnlocked(r, ctx);
    return el(
      'button',
      {
        type: 'button',
        class: `${cls}${open ? '' : ' locked'}`,
        'aria-pressed': String(current),
        title: open ? `${r.name}${r.desc ? ` — ${r.desc}` : ''}` : `${r.name} · ${unlockHint(r, st.catalog)}`,
        onclick: () => open && updateProfile({ [r.type]: r.id }),
      },
      content,
    );
  };
  const currentAvatar = rewards.find((r) => r.type === 'avatar' && r.emoji === profile.avatar)?.id;
  fill($('pick-avatar'), rewards.filter((r) => r.type === 'avatar').map((r) => pickBtn(r, r.emoji, 'pick', r.id === currentAvatar)));
  fill(
    $('pick-theme'),
    rewards.filter((r) => r.type === 'theme').map((r) => {
      const key = r.id.replace(/^theme-/, '');
      const open = isUnlocked(r, ctx);
      return pickBtn(r, [el('div', { class: 'sw' }, (THEME_SW[key] || THEME_SW.sede).map((c) => el('span', { style: `background:${c}` }))), el('div', { class: 'tx' }, el('b', {}, `${open ? '' : '🔒 '}${r.name}`), el('span', {}, open ? r.desc : unlockHint(r, st.catalog)))], 'theme-card', key === profile.theme);
    }),
  );
  const none = { id: '', type: 'frame', name: 'Sin marco', unlock: { default: true } };
  fill(
    $('pick-frame'),
    [none, ...rewards.filter((r) => r.type === 'frame')].map((r) => {
      const key = r.id.replace(/^frame-/, '');
      const b = pickBtn(r, `${isUnlocked(r, ctx) ? '' : '🔒 '}${r.name}`, 'pick frame', (profile.frame || '') === key);
      if (!r.id) b.onclick = () => updateProfile({ frame: null });
      return b;
    }),
  );
}

function wireProfile() {
  let t;
  $('p-name').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => updateProfile({ name: e.target.value.trim() }), 400);
  });
  $('pick-title').addEventListener('change', (e) => updateProfile({ title: e.target.value || null }));
  $('showcase-edit').addEventListener('click', () => {
    showcaseEditing = !showcaseEditing;
    renderProfilePage();
  });
  $('pf-edit-close').addEventListener('click', () => $('pf-edit').close());
  $('pf-edit').addEventListener('click', (e) => e.target === $('pf-edit') && $('pf-edit').close()); // clic fuera
  for (const b of document.querySelectorAll('[data-ptab]')) {
    b.addEventListener('click', () => {
      editTab = b.dataset.ptab;
      renderEdit();
    });
  }
}

// ---------- Ajustes ----------
// Pocas opciones a propósito: las sedes, los plazos y los tiempos los decide el catálogo.

async function updateSettings(patch) {
  const synced = Object.keys(patch).some((k) => k === 'profile' || SYNCED_PREFS.includes(k));
  st.settings = { ...st.settings, ...patch, ...(synced ? { profileUpdatedAt: Date.now() } : {}) };
  await saveSettings(st.settings);
}

// ---------- Cuenta (nube) ----------

let accountMsg = '';

function renderAccount() {
  const box = $('account');
  box.hidden = !CLOUD_ENABLED;
  if (!CLOUD_ENABLED) return;
  const acc = st.account;
  if (!acc) {
    box.className = 'card account out';
    fill(
      box,
      el(
        'div',
        { class: 'pitch' },
        el('div', { class: 'cloud-art', 'aria-hidden': 'true' }, '☁️'),
        el(
          'div',
          {},
          el('b', {}, 'Lleva tu progreso a todos tus PCs'),
          el('p', {}, 'Sin cuenta, todo sigue funcionando solo en este PC.'),
          el('ul', { class: 'perks' }, ['🏆 Logros a salvo', '💻 Varios PCs, un perfil', '🔒 Solo tú ves tus datos'].map((x) => el('li', {}, x))),
        ),
        el('button', { class: 'btn-google', onclick: doSignIn }, el('span', { class: 'g', 'aria-hidden': 'true' }, 'G'), 'Entrar con Google'),
      ),
      accountMsg ? el('p', { class: 'help', style: 'color:var(--danger);margin-top:12px' }, accountMsg) : null,
    );
    return;
  }
  const c = st.cloud || {};
  const status = c.status;
  const devices = c.devices || [];
  const label = acc.name || acc.email;
  box.className = 'card account';
  const avatar = el('div', { class: 'avatar', 'aria-hidden': 'true' }, me.profile.avatar, el('span', { class: 'lvl' }, me.lv.level));
  paintAvatar(avatar, me.profile, me.lv.level);
  const friendly = (e) => (/fetch|network|internet/i.test(e) ? 'Sin conexión: se reintentará sola' : /sesión|jwt|token/i.test(e) ? 'La sesión ha caducado: vuelve a entrar' : e);
  const when = (ts) => (fmtAgo(ts) === 'Hoy' ? `a las ${new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : fmtAgo(ts).toLowerCase());
  fill(
    box,
    el(
      'div',
      { class: 'acc-head' },
      avatar,
      el(
        'div',
        { class: 'who' },
        el('b', {}, label),
        acc.name ? el('small', {}, acc.email) : null,
        el('div', {}, el('span', { class: `sync-pill${status?.error ? ' err' : status?.at ? '' : ' wait'}` }, status?.error ? friendly(status.error) : status?.at ? `Sincronizado ${when(status.at)}` : 'Sincronizando por primera vez…')),
      ),
      el('button', { onclick: syncNow }, '↻ Sincronizar'),
    ),
    devices.length ? el('div', { class: 'devs-title' }, `Tus PCs (${devices.length})`) : null,
    devices.length
      ? el(
          'div',
          { class: 'devs' },
          devices.map((d) => {
            const me = d.id === c.deviceId;
            return el(
              'div',
              { class: `dev${me ? ' me' : ''}` },
              el('span', { class: 'ico', 'aria-hidden': 'true' }, me ? '🖥️' : '💻'),
              el('div', {}, el('span', {}, d.name, me ? el('span', { class: 'me-tag' }, 'ESTE PC') : null), el('small', {}, d.last_sync_at ? `Última sincronización: ${fmtAgo(Date.parse(d.last_sync_at))}` : 'Aún sin sincronizar')),
              me
                ? el('button', { class: 'ghost', onclick: () => renameDevice(d) }, 'Renombrar')
                : el('button', { class: 'ghost danger', onclick: () => removeDevice(d) }, 'Quitar'),
            );
          }),
        )
      : null,
    el(
      'div',
      { class: 'acc-foot' },
      el('button', { onclick: doSignOut }, 'Cerrar sesión'),
      el('button', { class: 'ghost danger', onclick: doDeleteAccount }, 'Borrar mi cuenta'),
    ),
    accountMsg ? el('p', { class: 'help', style: 'margin-top:10px' }, accountMsg) : null,
  );
}

async function withMsg(fn, okMsg) {
  try {
    accountMsg = '';
    await fn();
    accountMsg = okMsg || '';
  } catch (e) {
    accountMsg = /did not approve|canceled|cancelled|closed/i.test(e.message) ? 'Has cerrado la ventana de Google antes de terminar.' : `Algo ha fallado: ${e.message}`;
  }
  await refresh();
}

const doSignIn = () => withMsg(async () => {
  await signIn();
  await chrome.runtime.sendMessage({ type: 'cloud-sync' });
}, 'Sesión iniciada. Tus datos ya están en la nube.');

const syncNow = () => withMsg(() => chrome.runtime.sendMessage({ type: 'cloud-sync' }));

const renameDevice = (d) => {
  const name = prompt('Nombre de este PC (p. ej. «PC oficina»):', d.name);
  if (!name || !name.trim()) return;
  withMsg(async () => {
    await api(`/devices?id=eq.${d.id}`, { method: 'PATCH', body: { name: name.trim().slice(0, 40) }, prefer: 'return=minimal' });
    await chrome.runtime.sendMessage({ type: 'cloud-sync' });
  });
};

const removeDevice = (d) => {
  if (!confirm(`¿Quitar «${d.name}»? Se borrará de la nube todo lo que ese PC había subido.`)) return;
  withMsg(async () => {
    await api(`/devices?id=eq.${d.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await chrome.runtime.sendMessage({ type: 'cloud-sync' });
  }, `«${d.name}» quitado.`);
};

const doSignOut = () => {
  if (!confirm('¿Cerrar sesión? Lo de este PC se queda aquí; lo de tus otros PCs dejará de verse hasta que vuelvas a entrar.')) return;
  withMsg(signOut, 'Sesión cerrada.');
};

const doDeleteAccount = () => {
  if (!confirm('¿Borrar tu cuenta? Se eliminará de la nube TODO lo tuyo (horas de todos tus PCs, logros, perfil). Lo guardado en este PC se queda.')) return;
  if (!confirm('Última confirmación: esto no se puede deshacer.')) return;
  withMsg(async () => {
    await deleteMyAccount();
    await signOut();
  }, 'Cuenta borrada. Nada tuyo queda en la nube.');
};

function renderSettings() {
  renderAccount();
  $('notif').checked = !!st.settings.notifications;
  $('sound').checked = !!st.settings.sound;
  $('sound').disabled = !st.settings.notifications;
  $('dl-alerts').checked = !!st.settings.deadlineAlerts;
  $('break-on').checked = !!st.settings.breakReminder;
  renderShortcutsSettings();

  const u = st.updateStatus;
  const v = chrome.runtime.getManifest().version;
  $('ver-title').textContent = `${BRAND.name} ${v}`;
  // De dónde sale el catálogo (plazos, novedades, logros…) y cuándo se ha comprobado.
  const cs = st.catalogStatus;
  const origin = { supabase: 'Supabase', github: 'GitHub (respaldo)', bundled: 'la copia que trae la extensión' }[st.catalog.source] || 'la nube';
  fill(
    $('cat-status'),
    el('span', { class: `sync-pill${cs?.error ? ' err' : st.catalog.source === 'bundled' ? ' wait' : ''}` },
      cs?.error ? `Catálogo: sin conexión, se usa ${origin}` : `Catálogo de ${origin}`),
    el('small', { class: 'muted' }, ` · ${st.catalog.games.length} sedes, ${st.catalog.achievements.length} logros, ${st.catalog.deadlines.length} plazos, ${st.catalog.news.length} novedades${cs?.at ? ` · comprobado ${fmtAgo(cs.at) === 'Hoy' ? `a las ${new Date(cs.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : fmtAgo(cs.at).toLowerCase()}` : ''}`),
  );
  $('upd-help').textContent = !REMOTE_ENABLED
    ? 'Sin repositorio de actualizaciones configurado.'
    : updateAvailable(u)
      ? `Hay una versión nueva: ${u.published}. Descárgala desde GitHub o haz «git pull»; tus datos se conservan.`
      : `Estás al día${u?.checkedAt ? ` (comprobado ${fmtAgo(u.checkedAt).toLowerCase()})` : ''}. Los juegos, logros y plazos nuevos llegan solos.`;
}

const saveShortcuts = (list) => updateSettings({ shortcuts: list });

function renderShortcutsSettings() {
  const list = shortcutsOf(st);
  const move = (i, d) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    saveShortcuts(next);
  };
  fill(
    $('sc-list'),
    list.length
      ? list.map((sc, i) =>
          el(
            'div',
            { class: 'sc-row' },
            el('span', { class: 'e', 'aria-hidden': 'true' }, sc.emoji || '🔗'),
            el('div', { style: 'min-width:0' }, el('div', {}, sc.name), el('div', { class: 'u' }, sc.url)),
            el(
              'div',
              { class: 'btns' },
              el('button', { type: 'button', class: 'ghost', disabled: i === 0, 'aria-label': `Subir ${sc.name}`, onclick: () => move(i, -1) }, '↑'),
              el('button', { type: 'button', class: 'ghost', disabled: i === list.length - 1, 'aria-label': `Bajar ${sc.name}`, onclick: () => move(i, 1) }, '↓'),
              el('button', { type: 'button', class: 'ghost danger', 'aria-label': `Quitar ${sc.name}`, onclick: () => saveShortcuts(list.filter((x) => x.id !== sc.id)) }, '✕'),
            ),
          ),
        )
      : el('p', { class: 'muted', style: 'margin:0' }, 'No tienes accesos directos.'),
  );
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireSettings() {
  // Un solo interruptor para logros, niveles y píldoras de XP.
  $('notif').addEventListener('change', (e) => updateSettings({ notifications: e.target.checked, xpToasts: e.target.checked }));
  $('sound').addEventListener('change', (e) => updateSettings({ sound: e.target.checked }));
  $('dl-alerts').addEventListener('change', (e) => updateSettings({ deadlineAlerts: e.target.checked }));
  $('break-on').addEventListener('change', (e) => updateSettings({ breakReminder: e.target.checked }));
  $('test-toast').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'test-toast' }).catch(() => {}));
  $('sc-reset').addEventListener('click', () => {
    if (confirm('¿Volver a los accesos directos de serie? Se quitarán los que hayas añadido.')) updateSettings({ shortcuts: null });
  });
  $('upd-check').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Buscando…';
    await chrome.runtime.sendMessage({ type: 'check-updates' }).catch(() => {});
    e.target.disabled = false;
    e.target.textContent = 'Buscar actualizaciones';
    refresh();
  });

  const slug = BRAND.name.toLowerCase();
  $('exp-json').addEventListener('click', () =>
    download(`${slug}-copia-${dayKey(Date.now())}.json`, JSON.stringify({ app: 'sedeam', exportedAt: new Date().toISOString(), data: st.localData, settings: st.settings }, null, 2), 'application/json'),
  );
  $('imp').addEventListener('click', () => $('imp-file').click());
  $('imp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      // También acepta las copias de la versión anterior (Horas en Sede).
      if (!['sedeam', 'horas-en-sede'].includes(json.app) || typeof json.data?.days !== 'object') throw new Error('formato');
      if (!confirm('Esto sustituye tus datos actuales por los de la copia. ¿Seguir?')) return;
      if (st.account && !confirm('Tienes la cuenta iniciada: lo restaurado se subirá como datos de ESTE PC. Si la copia viene de otro PC que también sincroniza, esas horas contarían dos veces. ¿Seguir?')) return;
      await chrome.storage.local.set({ data: json.data, settings: { ...DEFAULT_SETTINGS, ...json.settings } });
      $('data-msg').textContent = 'Copia restaurada.';
    } catch {
      $('data-msg').textContent = `Ese archivo no parece una copia de ${BRAND.name}.`;
    }
  });
  $('reset').addEventListener('click', async () => {
    if (!confirm('¿Borrar todas tus horas y logros? No se puede deshacer (guarda una copia antes si la quieres).')) return;
    await chrome.storage.local.remove('data');
    await chrome.storage.session.set({ live: null, recent: [] });
    $('data-msg').textContent = 'Datos borrados. Empiezas de nuevo como Becario.';
  });
}

// ---------- Navegación y ciclo ----------

function route() {
  const [tab, sub] = (location.hash || '#biblioteca').slice(1).split('/');
  const valid = ['biblioteca', 'temporada', 'estadisticas', 'logros', 'perfil', 'ajustes'].includes(tab) ? tab : 'biblioteca';
  return { tab: valid, sub: sub ? decodeURIComponent(sub) : null };
}

function render() {
  if (!st) return;
  const all = allGames(st.catalog, st.settings);
  data = withLive(st.data, st.live);
  const totals = sumAll(data);
  // Se muestran los juegos activos y los que tienen horas aunque estén desactivados.
  games = all.filter((g) => g.enabled || totals[g.id]);
  byId = Object.fromEntries(all.map((g) => [g.id, g]));
  me = profileFor(st, data);

  const { tab, sub } = route();
  for (const s of document.querySelectorAll('section.view')) s.hidden = s.id !== tab;
  for (const a of document.querySelectorAll('nav a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = sub && byId[sub] ? `${byId[sub].name} · ${BRAND.name}` : BRAND.name;
  renderChrome();
  if (tab === 'biblioteca') renderLibrary(sub);
  else if (tab === 'estadisticas') {
    renderStatTiles();
    renderWrapLinks();
    renderActivity();
    renderHeat();
    renderHours();
    renderRecords();
    renderNomina();
  } else if (tab === 'temporada') renderSeason();
  else if (tab === 'perfil') renderProfilePage();
  else if (tab === 'logros') renderAchievements();
  else renderSettings();
}

async function refresh() {
  st = await loadAll();
  const { unseen = [] } = await chrome.storage.local.get('unseen');
  st.unseen = unseen;
  for (const id of unseen) fresh.add(id);
  render();
}

document.querySelectorAll('[data-range]').forEach((b) =>
  b.addEventListener('click', () => {
    range = b.dataset.range;
    offset = 0;
    renderActivity();
  }),
);
$('prev').addEventListener('click', () => { offset--; renderActivity(); });
$('next').addEventListener('click', () => { if (offset < 0) { offset++; renderActivity(); } });
$('search').addEventListener('input', (e) => {
  search = e.target.value;
  renderLibrary(route().sub);
});
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
// Solo se repinta cuando cambian datos de verdad (no en cada tecla de un formulario de Ajustes).
chrome.storage.onChanged.addListener((changes) => {
  // El aviso de logro también sale aquí si estás mirando la biblioteca en ese momento.
  const toast = changes.lastToast?.newValue;
  if (toast && Date.now() - toast.at < 10_000 && document.visibilityState === 'visible') {
    showToasts(toast.items, { sound: st?.settings.sound, brand: BRAND.name });
  }
  if (changes.data || changes.settings || changes.remoteCatalog || changes.updateStatus || changes.live || changes.cloud || changes.cloudSession || changes.catalogStatus) refresh();
});
wireSettings();
wireProfile();
setInterval(refresh, 30_000);
refresh();
