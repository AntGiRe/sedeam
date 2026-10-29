import {
  HOUR, MIN, addDays, bestDay, dayKey, fmtAgo, fmtDur, fmtHours, levelFor, parseKey, streaks, sumAll, sumRange, total,
} from './lib/core.js';
import { progress } from './lib/rules.js';
import { allGames, normalizeDomain } from './lib/games.js';
import { DEFAULT_SETTINGS, saveSettings } from './lib/store.js';
import { capsule, el, fmtProgress, levelColor, loadAll, updateAvailable, withLive } from './lib/view.js';
import { showToasts } from './lib/toast.js';
import { BRAND, REMOTE_ENABLED, REPO, repoUrl } from './config.js';

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
let fresh = new Set(); // logros recién desbloqueados que aún no habías visto

// ---------- Tooltip ----------

const tip = $('tip');
function showTip(evt, content) {
  tip.replaceChildren(...content);
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
  container.replaceChildren(root);
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
  const grand = total(sumAll(data));
  const lv = levelFor(grand, st.catalog.levels);
  const live = st.live && byId[st.live.game];
  $('chip-title').textContent = lv.title;
  $('chip-status').replaceChildren(live ? el('span', { class: 'status-playing' }, `Jugando a ${live.name}`) : el('span', { class: 'status-online' }, `Nivel ${lv.level} · ${fmtHours(grand)}`));
  $('chip-lvl').textContent = lv.level;
  $('chip-avatar').style.setProperty('--lvl', levelColor(lv.level));
  $('chip-avatar').classList.toggle('playing', !!live);

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
  $('side-list').replaceChildren(
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

  $('lib-main').replaceChildren(
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

  $('lib-main').replaceChildren(
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
  else chart.replaceChildren(el('div', { class: 'empty' }, 'Sin partidas en los últimos 30 días.'));
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

function renderProfile() {
  const grand = total(sumAll(data));
  const lv = levelFor(grand, st.catalog.levels);
  $('p-lvl').textContent = lv.level;
  $('p-avatar').style.setProperty('--lvl', levelColor(lv.level));
  $('p-avatar').classList.toggle('playing', !!st.live);
  $('p-level').textContent = `Nivel ${lv.level}`;
  $('p-title').textContent = lv.title;
  $('p-xp').style.width = `${Math.round(lv.progress * 100)}%`;
  $('p-xp-label').textContent = lv.nextTitle ? `${fmtHours(grand)} · faltan ${fmtHours(lv.hoursToNext * HOUR)} para ${lv.nextTitle}` : `${fmtHours(grand)} · rango máximo`;

  const now = new Date();
  const today = dayKey(now);
  const tiles = [
    ['Hoy', total(data.days[today] || {}), cap(fmtDate(now, { weekday: 'long', day: 'numeric' }))],
    ['Esta semana', total(sumRange(data, dayKey(mondayOf(now)), today)), 'desde el lunes'],
    ['Este mes', total(sumRange(data, dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), today)), cap(fmtDate(now, { month: 'long' }))],
    ['Este año', total(sumRange(data, `${now.getFullYear()}-01-01`, today)), String(now.getFullYear())],
    ['Total', grand, 'desde que llevas la cuenta'],
  ];
  $('tiles').replaceChildren(...tiles.map(([k, ms, sub]) => el('div', { class: 'tile' }, el('div', { class: 'eyebrow' }, k), el('div', { class: 'v' }, ms >= HOUR ? fmtHours(ms) : fmtDur(ms)), el('div', { class: 's' }, sub))));
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
  if (!periodTotal) $('chart').replaceChildren(el('div', { class: 'empty' }, 'Sin actividad en este periodo. Hacienda te echa de menos.'));
  else columnChart($('chart'), items);

  // Tabla de totales: hace de leyenda y de vista en tabla del gráfico.
  const sums = sumRange(data, b.items[0].from, b.items[b.items.length - 1].to);
  const rows = games.filter((g) => sums[g.id] > 0).sort((a, z) => sums[z.id] - sums[a.id]);
  const max = Math.max(1, ...rows.map((g) => sums[g.id]));
  $('totals').replaceChildren(
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
  $('heat').replaceChildren(root);
  $('heat-sub').textContent = `${fmtHours(yearTotal)} en ${active} días`;
  $('heat-legend').replaceChildren(...HEAT.flatMap(([, c, l]) => [el('span', { class: 'sw', style: `background:${c}` }), el('span', { class: 't' }, l)]));
}

function renderHours() {
  const sums = new Array(24).fill(0);
  for (const arr of Object.values(data.hours)) arr.forEach((ms, h) => (sums[h] += ms));
  if (!total(sums)) {
    $('hours').replaceChildren(el('div', { class: 'empty' }, 'Aún no hay datos.'));
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
  $('records').replaceChildren(...rec.map(([k, v, sub]) => el('div', { class: 'tile' }, el('div', { class: 'eyebrow' }, k), el('div', { class: 'v' }, v), el('div', { class: 's' }, sub))));
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
  $('ach-filter').replaceChildren(
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
  $('ach-list').replaceChildren(...(shown.length ? shown.map((a) => achRow(a)) : [el('div', { class: 'empty' }, 'Nada por aquí.')]));
  // Al ver la pestaña de logros, los nuevos dejan de serlo (pero siguen marcados mientras estés aquí).
  if (st.unseen.length) chrome.storage.local.set({ unseen: [] });
}

// ---------- Ajustes ----------

async function updateSettings(patch) {
  st.settings = { ...st.settings, ...patch };
  await saveSettings(st.settings);
}

function renderSettings() {
  const u = st.updateStatus;
  const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  $('upd-info').replaceChildren(
    ...kv('Versión instalada', chrome.runtime.getManifest().version),
    ...kv('Última publicada', REMOTE_ENABLED ? u?.published || 'sin comprobar' : 'sin repositorio configurado'),
    ...kv('Catálogo', `v${st.catalog.catalogVersion} · ${st.catalog.source === 'remote' ? 'descargado de GitHub' : 'el que trae la extensión'} · ${st.catalog.games.length} juegos, ${st.catalog.achievements.length} logros`),
    ...kv('Última comprobación', u?.checkedAt ? `${fmtAgo(u.checkedAt)}, ${new Date(u.checkedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'nunca'),
  );
  $('upd-help').replaceChildren(
    REMOTE_ENABLED
      ? el('span', {}, 'El catálogo (juegos y logros) se descarga solo cada hora. El código se actualiza solo si tienes activado el script de actualización automática; si no, ', el('a', { href: repoUrl(), target: '_blank', rel: 'noopener' }, 'descarga la última versión'), ' en la misma carpeta y la extensión se recargará sola. Tus horas y logros no se pierden.')
      : `Para recibir actualizaciones, pon tu usuario de GitHub en config.js (ahora: ${REPO.owner}). Mientras tanto se usa el catálogo que trae la extensión.`,
  );

  $('idle').value = String(st.settings.idleMinutes);
  $('notif').checked = !!st.settings.notifications;
  $('toast-page').checked = !!st.settings.toastInPage;
  $('sound').checked = !!st.settings.sound;
  $('sysnotif').checked = !!st.settings.systemNotifications;
  for (const id of ['toast-page', 'sound', 'sysnotif']) $(id).disabled = !st.settings.notifications;
  const disabled = new Set(st.settings.disabled);
  $('glist').replaceChildren(
    ...allGames(st.catalog, st.settings).map((g) => {
      const id = `g-${g.id}`;
      return el(
        'div',
        { class: 'grow' },
        el('input', {
          type: 'checkbox', id, checked: !disabled.has(g.id),
          onchange: (e) => {
            const s = new Set(st.settings.disabled);
            e.target.checked ? s.delete(g.id) : s.add(g.id);
            updateSettings({ disabled: [...s] });
          },
        }),
        capsule(g, { mini: true }),
        el('label', { class: 'info2', for: id }, el('div', {}, g.name, g.custom ? el('span', { class: 'muted' }, ' · tuyo') : null), el('div', { class: 'doms' }, g.domains.join(' · '))),
        g.custom
          ? el('button', {
              class: 'danger', type: 'button', 'aria-label': `Quitar ${g.name}`,
              onclick: () => {
                if (confirm(`¿Quitar "${g.name}"? Las horas ya registradas se conservan en tus datos.`)) {
                  updateSettings({ customGames: st.settings.customGames.filter((c) => c.id !== g.id) });
                }
              },
            }, 'Quitar')
          : null,
      );
    }),
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
  $('upd-check').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Buscando…';
    await chrome.runtime.sendMessage({ type: 'check-updates' }).catch(() => {});
    e.target.disabled = false;
    e.target.textContent = 'Buscar actualizaciones ahora';
    refresh();
  });
  $('idle').addEventListener('change', (e) => updateSettings({ idleMinutes: Number(e.target.value) }));
  $('notif').addEventListener('change', (e) => updateSettings({ notifications: e.target.checked }));
  $('toast-page').addEventListener('change', (e) => updateSettings({ toastInPage: e.target.checked }));
  $('sound').addEventListener('change', (e) => updateSettings({ sound: e.target.checked }));
  $('sysnotif').addEventListener('change', (e) => updateSettings({ systemNotifications: e.target.checked }));
  $('test-toast').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'test-toast' }).catch(() => {}));
  $('test-system').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'test-toast', system: true }).catch(() => {}));
  $('add').addEventListener('submit', (e) => {
    e.preventDefault();
    const domains = $('add-domains').value.split(',').map(normalizeDomain).filter((d) => d.includes('.'));
    if (!domains.length) {
      $('add-domains').setCustomValidity('Pon al menos un dominio válido, p. ej. atc.gobiernodecanarias.org');
      $('add-domains').reportValidity();
      return;
    }
    // Permiso para mostrar los avisos de logro dentro de esa web. Si se rechaza, se usará la notificación del sistema.
    chrome.permissions.request({ origins: domains.map((d) => `https://*.${d}/*`) }).catch(() => {});
    const game = { id: `c_${Date.now().toString(36)}`, name: $('add-name').value.trim(), emoji: $('add-emoji').value.trim() || '🎮', domains };
    updateSettings({ customGames: [...st.settings.customGames, game] });
    e.target.reset();
  });
  $('add-domains').addEventListener('input', (e) => e.target.setCustomValidity(''));

  const stamp = () => dayKey(Date.now());
  const slug = BRAND.name.toLowerCase();
  $('exp-json').addEventListener('click', () =>
    download(`${slug}-${stamp()}.json`, JSON.stringify({ app: 'sedeam', exportedAt: new Date().toISOString(), data: st.data, settings: st.settings }, null, 2), 'application/json'),
  );
  $('exp-csv').addEventListener('click', () => {
    const names = Object.fromEntries(allGames(st.catalog, st.settings).map((g) => [g.id, g.name]));
    const lines = ['fecha;juego;minutos'];
    for (const day of Object.keys(data.days).sort()) {
      for (const [g, ms] of Object.entries(data.days[day])) {
        if (ms > 0) lines.push(`${day};${names[g] || g};${(ms / MIN).toFixed(1).replace('.', ',')}`);
      }
    }
    download(`${slug}-${stamp()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  });
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
      await chrome.storage.local.set({ data: json.data, settings: { ...DEFAULT_SETTINGS, ...json.settings } });
      $('data-msg').textContent = 'Copia importada.';
    } catch {
      $('data-msg').textContent = `Ese archivo no parece una copia de ${BRAND.name}.`;
    }
  });
  $('reset').addEventListener('click', async () => {
    if (!confirm('¿Borrar todas tus horas y logros? No se puede deshacer (exporta una copia antes si la quieres).')) return;
    await chrome.storage.local.remove('data');
    await chrome.storage.session.set({ live: null, recent: [] });
    $('data-msg').textContent = 'Datos borrados. Empiezas de nuevo como Becario.';
  });
}

// ---------- Navegación y ciclo ----------

function route() {
  const [tab, sub] = (location.hash || '#biblioteca').slice(1).split('/');
  const valid = ['biblioteca', 'estadisticas', 'logros', 'ajustes'].includes(tab) ? tab : 'biblioteca';
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
    renderProfile();
    renderActivity();
    renderHeat();
    renderHours();
    renderRecords();
  } else if (tab === 'logros') renderAchievements();
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
  if (changes.data || changes.settings || changes.remoteCatalog || changes.updateStatus || changes.live) refresh();
});
wireSettings();
setInterval(refresh, 30_000);
refresh();
