// Informe mensual de horas en sedes: documento limpio para imprimir o guardar como PDF, y su CSV.
import { MIN, dayKey, fmtDur, fmtHours, parseKey, total } from './lib/core.js';
import { allGames } from './lib/games.js';
import { parsePeriod } from './lib/wrapped.js';
import { el, fill, loadAll, profileFor } from './lib/view.js';
import { BRAND } from './config.js';

const $ = (id) => document.getElementById(id);
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Horas con dos decimales, para sumar en una hoja de cálculo sin redondeos raros.
const hh = (ms) => (ms / 3_600_000).toFixed(2).replace('.', ',');

let st = null;
let model = null;

function buildModel(monthId) {
  const p = parsePeriod(monthId);
  const games = allGames(st.catalog, st.settings);
  const days = [];
  for (let d = parseKey(p.from); dayKey(d) <= p.to; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
  const used = games.filter((g) => days.some((k) => (st.data.days[k]?.[g.id] || 0) > 0));
  // Juegos que ya no existen en el catálogo pero tienen horas ese mes.
  const known = new Set(games.map((g) => g.id));
  for (const k of days) for (const id of Object.keys(st.data.days[k] || {})) if (!known.has(id) && st.data.days[k][id] > 0) {
    known.add(id);
    used.push({ id, name: id, color: '#8f98a0' });
  }
  const rows = days.map((k) => ({ k, date: parseKey(k), cells: used.map((g) => st.data.days[k]?.[g.id] || 0) }));
  const colTotals = used.map((_, i) => rows.reduce((a, r) => a + r.cells[i], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const active = rows.filter((r) => total(r.cells) >= 5 * MIN).length;
  const loading = days.reduce((a, k) => a + (st.data.loading?.[k] || 0), 0);
  return { p, used, rows, colTotals, grand, active, loading };
}

function render() {
  const { profile } = profileFor(st, st.data);
  const m = model;
  document.title = `Informe de horas · ${m.p.label}`;
  const max = Math.max(1, ...m.colTotals);
  fill(
    $('page'),
    el(
      'header',
      {},
      el('div', {}, el('h1', {}, 'Informe de horas en sedes electrónicas'), el('div', { class: 'sub' }, `${cap(m.p.label)} · ${profile.name}`)),
      el('div', { class: 'meta' }, `Generado el ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`, el('br'), `con ${BRAND.name}`),
    ),
    el(
      'div',
      { class: 'kpis' },
      [
        ['Total', fmtHours(m.grand)],
        ['Días con actividad', String(m.active)],
        ['Media por día activo', m.active ? fmtDur(m.grand / m.active) : '—'],
        ['Identificación (Cl@ve)', fmtDur(m.loading)],
      ].map(([k, v]) => el('div', { class: 'kpi' }, el('span', {}, k), el('b', {}, v))),
    ),
    el('h2', {}, 'Por sede'),
    m.used.length
      ? el(
          'table',
          { class: 'bars' },
          el('tbody', {}, m.used.map((g, i) => el('tr', {}, el('td', {}, el('span', { class: 'sw', style: `background:${g.color}` }), g.name), el('td', { class: 'b' }, el('div', { class: 'track' }, el('i', { style: `width:${(m.colTotals[i] / max) * 100}%;background:${g.color}` }))), el('td', {}, fmtDur(m.colTotals[i])), el('td', {}, `${Math.round((m.colTotals[i] / m.grand) * 100)} %`)))),
        )
      : el('p', {}, 'Sin actividad registrada este mes.'),
    el('h2', {}, 'Detalle diario'),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Día'), m.used.map((g) => el('th', {}, g.name)), el('th', {}, 'Total'))),
        el('tbody', {}, m.rows.map((r) => {
          const t = total(r.cells);
          const we = r.date.getDay() === 0 || r.date.getDay() === 6;
          return el('tr', { class: `${we ? 'weekend' : ''}${t ? '' : ' zero'}` }, el('td', {}, `${WD[r.date.getDay()]} ${r.date.getDate()}`), r.cells.map((c) => el('td', {}, c ? fmtDur(c) : '—')), el('td', {}, t ? fmtDur(t) : '—'));
        })),
        el('tfoot', {}, el('tr', {}, el('td', {}, 'Total'), m.colTotals.map((c) => el('td', {}, fmtDur(c))), el('td', {}, fmtDur(m.grand)))),
      ),
    ),
    el('p', { class: 'note' }, `Tiempo activo: solo cuenta con la pestaña de la sede delante, Chrome en primer plano y actividad de ratón o teclado en los últimos ${st.settings.idleMinutes} minutos. Datos registrados localmente por ${BRAND.name} en este navegador; no incluyen trabajo hecho en programas de escritorio ni fuera de Chrome.`),
  );
}

function csv() {
  const m = model;
  const lines = [['Día', ...m.used.map((g) => `${g.name} (h)`), 'Total (h)'].join(';')];
  for (const r of m.rows) lines.push([r.k, ...r.cells.map(hh), hh(total(r.cells))].join(';'));
  lines.push(['Total', ...m.colTotals.map(hh), hh(m.grand)].join(';'));
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
  const a = el('a', { href: url, download: `${BRAND.name.toLowerCase()}-informe-${m.p.id}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function main() {
  st = await loadAll({ lens: false });
  const months = [...new Set([dayKey(new Date()).slice(0, 7), ...Object.keys(st.data.days).map((k) => k.slice(0, 7))])].sort().reverse();
  const q = new URLSearchParams(location.search).get('mes');
  const current = q && parsePeriod(q)?.kind === 'month' ? q : months[0];
  if (!months.includes(current)) months.unshift(current);
  fill($('month'), months.map((id) => el('option', { value: id, selected: id === current }, cap(parsePeriod(id).label))));
  model = buildModel(current);
  render();
}

$('month').addEventListener('change', (e) => {
  history.replaceState(null, '', `?mes=${e.target.value}`);
  model = buildModel(e.target.value);
  render();
});
$('print').addEventListener('click', () => window.print());
$('csv').addEventListener('click', csv);

main();
