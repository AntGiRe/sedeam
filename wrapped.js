import { MIN, fmtDur, fmtHours, parseKey } from './lib/core.js';
import { allGames } from './lib/games.js';
import { computeWrapped, latestPeriods, parsePeriod } from './lib/wrapped.js';
import { drawShareCard } from './lib/sharecard.js';
import { applyTheme, capsule, el, fill, loadAll, profileFor } from './lib/view.js';
import { BRAND } from './config.js';

const $ = (id) => document.getElementById(id);
const SLIDE_MS = 7000;

let slides = [];
let index = 0;
let paused = false;
let timer = null;
let started = 0;
let elapsed = 0;

// ---------- Diapositivas ----------

function build(w, profile, st) {
  const p = w.period;
  const out = [];
  const add = (c1, c2, ...children) => out.push({ c1, c2, node: el('div', { class: 'slide reveal' }, ...children) });
  const top = w.ranking[0];
  const isYear = p.kind === 'year';
  const en = isYear ? `en ${p.name}` : `en ${p.name}`;

  if (!w.totalMs) {
    add('#3a4a5e', '#1d2b45', el('div', { class: 'k' }, `Tu ${isYear ? 'año' : 'mes'} en ${BRAND.name}`), el('div', { class: 'emoji-xl' }, '🦗'), el('div', { class: 'big' }, `Nada de nada ${en}`), el('div', { class: 'soft' }, 'Ni un minuto en sedes. O estabas de vacaciones, o eres el gestor más eficiente de España. Elige la versión que más te guste.'));
    return out;
  }

  add('#2a78d6', '#6250d6',
    el('div', { class: 'k' }, `${profile.name} · ${profile.titleText}`),
    el('div', { class: 'emoji-xl' }, profile.avatar),
    el('div', { class: 'big' }, isYear ? `Tu ${p.name} en ${BRAND.name}` : `Tu ${p.name} en ${BRAND.name}`),
    el('div', { class: 'soft' }, 'Ponte cómodo. Hemos contado cada minuto que le has dedicado a la Administración.'),
  );

  const changeTxt = w.change == null ? null : w.change >= 0 ? `▲ ${Math.round(w.change * 100)} % más que ${isYear ? 'el año anterior' : 'el mes anterior'}` : `▼ ${Math.round(-w.change * 100)} % menos que ${isYear ? 'el año anterior' : 'el mes anterior'}`;
  add('#1baf7a', '#2a78d6',
    el('div', { class: 'k' }, `Tiempo en sedes ${en}`),
    el('div', { class: 'huge' }, fmtHours(w.totalMs)),
    w.equivalence ? el('div', { class: 'med' }, `${w.equivalence.emoji} Eso son ${w.equivalence.text}.`) : null,
    changeTxt ? el('span', { class: `pill ${w.change >= 0 ? 'up' : 'down'}` }, changeTxt) : null,
    el('div', { class: 'soft' }, `En ${w.daysActive} ${w.daysActive === 1 ? 'día' : 'días'} distintos.`),
  );

  add(top.game.color, '#0a0f15',
    el('div', { class: 'k' }, `Tu sede ${isYear ? 'del año' : 'del mes'}`),
    capsule(top.game, { style: 'width:150px;font-size:15px;align-self:center;transform:rotate(-4deg)' }),
    el('div', { class: 'big' }, top.game.name),
    el('div', { class: 'soft' }, `${fmtHours(top.ms)} · el ${Math.round(top.share * 100)} % de tu tiempo. ${top.share > 0.8 ? 'Esto ya es una relación seria.' : 'Una relación sana, con espacio para otras sedes.'}`),
    w.ranking.length > 1
      ? el('div', { class: 'rank' }, w.ranking.slice(0, 4).map((r, i) => el('div', { class: 'row' }, el('span', { class: 'n' }, i + 1), el('div', {}, el('div', {}, `${r.game.emoji} ${r.game.name}`), el('div', { class: 'bar' }, el('i', { style: `width:${(r.ms / top.ms) * 100}%;background:${r.game.color}` }))), el('span', { class: 'v' }, fmtHours(r.ms)))))
      : null,
  );

  const bd = w.bestDay;
  add('#d95926', '#c98500',
    el('div', { class: 'k' }, 'Tu día más intenso'),
    el('div', { class: 'big' }, parseKey(bd.day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
    el('div', { class: 'huge', style: 'font-size:60px' }, fmtDur(bd.ms)),
    el('div', { class: 'soft' }, bd.ms >= 8 * 60 * MIN ? 'Más de una jornada entera en la sede. Respira.' : bd.ms >= 5 * 60 * MIN ? 'De esos días en los que comes delante del certificado digital.' : 'Intenso, pero sin dramas.'),
    w.favWeekday ? el('span', { class: 'pill' }, `📅 Tu día de la semana favorito: el ${w.favWeekday}`) : null,
  );

  if (w.peakHour != null) {
    const max = Math.max(...w.hours);
    const nightShare = w.nightMs / w.totalMs;
    add('#6250d6', '#0d366b',
      el('div', { class: 'k' }, 'Tu hora punta'),
      el('div', { class: 'huge' }, `${String(w.peakHour).padStart(2, '0')}:00`),
      el('div', { class: 'hours-viz', 'aria-hidden': 'true' }, w.hours.map((v, h) => el('i', { class: h === w.peakHour ? 'peak' : '', style: `height:${max ? Math.max(2, (v / max) * 100) : 2}%` }))),
      el('div', { class: 'hours-axis', 'aria-hidden': 'true' }, ['0h', '6h', '12h', '18h', '23h'].map((x) => el('span', {}, x))),
      el('div', { class: 'soft' }, nightShare >= 0.05 ? `Y ojo: ${fmtDur(w.nightMs)} entre las 22:00 y las 6:00. Hacienda nunca duerme, y tú tampoco.` : 'Horario de oficina impecable. Tu cuerpo te lo agradece.'),
    );
  }

  if (w.loadingMs || w.outages) {
    add('#e66767', '#3a2029',
      el('div', { class: 'k' }, 'Lo que no sale en la nómina'),
      el('div', { class: 'stats3' },
        el('div', {}, el('b', {}, fmtDur(w.loadingMs)), el('span', {}, '⏳ identificándote')),
        el('div', {}, el('b', {}, w.outages), el('span', {}, '💥 caídas de la sede')),
        el('div', {}, el('b', {}, fmtDur(w.rushMs)), el('span', {}, '🔥 días antes de plazo')),
      ),
      el('div', { class: 'soft' }, w.outages >= 5 ? '«Servicio temporalmente no disponible». Ya te sabes la letra.' : w.outages ? 'Alguna caída, nada que un buen F5 no arregle.' : 'Ni una caída. La sede te respeta.'),
    );
  }

  if (w.achievements.length || w.challenges) {
    add('#e8b64c', '#6e3f1c',
      el('div', { class: 'k' }, 'Tus trofeos'),
      el('div', { class: 'big' }, `${w.achievements.length} ${w.achievements.length === 1 ? 'logro' : 'logros'}${w.challenges ? ` y ${w.challenges} ${w.challenges === 1 ? 'reto' : 'retos'}` : ''}`),
      el('div', { class: 'badges' }, w.achievements.slice(0, 8).map((a) => el('span', {}, a.emoji, a.name))),
    );
  }

  add('#e8b64c', '#d55181',
    el('div', { class: 'k' }, 'Tu personalidad gestoril es…'),
    el('div', { class: 'emoji-xl' }, w.personality.emoji),
    el('div', { class: 'big' }, w.personality.name),
    el('div', { class: 'soft' }, w.personality.desc),
  );

  // Final: la tarjeta para compartir.
  const canvas = drawShareCard(w, profile, { brand: BRAND.name.toUpperCase() });
  const img = el('img', { alt: `Resumen de ${p.label} en ${BRAND.name}: ${fmtHours(w.totalMs)}` });
  img.src = canvas.toDataURL('image/png');
  const msg = el('div', { class: 'msg' });
  const file = `${BRAND.name.toLowerCase()}-wrapped-${p.id}.png`;
  out.push({
    c1: '#2a78d6',
    c2: '#0a0f15',
    final: true,
    node: el(
      'div',
      { class: 'slide final' },
      el('div', { class: 'k', style: 'text-align:center' }, 'Tu tarjeta para compartir'),
      img,
      el(
        'div',
        { class: 'acts' },
        el('button', { class: 'primary', onclick: () => {
          const a = el('a', { href: img.src, download: file });
          document.body.append(a);
          a.click();
          a.remove();
          msg.textContent = 'Imagen descargada.';
        } }, '⬇️ Descargar'),
        el('button', { onclick: () => canvas.toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            msg.textContent = 'Copiada. Pégala en WhatsApp o donde quieras.';
          } catch {
            msg.textContent = 'No se ha podido copiar; usa «Descargar».';
          }
        }) }, '📋 Copiar'),
        el('button', { onclick: () => go(0) }, '↺ Otra vez'),
        periodPicker(st, p.id),
      ),
      msg,
    ),
  });
  return out;
}

function periodPicker(st, current) {
  // Meses con datos (y los años), del más reciente al más antiguo.
  const months = [...new Set(Object.keys(st.data.days).map((k) => k.slice(0, 7)))].sort().reverse();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const opts = [...years.map((y) => ({ id: y, label: `Año ${y}` })), ...months.map((m) => ({ id: m, label: parsePeriod(m).label }))];
  if (!opts.some((o) => o.id === current)) opts.unshift({ id: current, label: parsePeriod(current).label });
  return el(
    'select',
    { 'aria-label': 'Ver otro periodo', onchange: (e) => (location.search = `?periodo=${e.target.value}`) },
    opts.map((o) => el('option', { value: o.id, selected: o.id === current }, o.label.charAt(0).toUpperCase() + o.label.slice(1))),
  );
}

// ---------- Reproductor ----------

function paintBars() {
  [...$('bars').children].forEach((b, i) => {
    b.className = i < index ? 'done' : '';
    b.firstChild.style.width = i < index ? '100%' : i === index ? `${Math.min(100, (elapsed / SLIDE_MS) * 100)}%` : '0';
  });
}

function go(i) {
  index = Math.max(0, Math.min(slides.length - 1, i));
  elapsed = 0;
  started = performance.now();
  const s = slides[index];
  $('story').style.setProperty('--c1', s.c1);
  $('story').style.setProperty('--c2', s.c2);
  $('story').classList.toggle('final-open', !!s.final);
  slides.forEach((x, k) => (x.node.hidden = k !== index));
  // Reinicia las animaciones de entrada.
  s.node.classList.remove('reveal');
  void s.node.offsetWidth;
  if (!s.final) s.node.classList.add('reveal');
  paintBars();
}

function loop(now) {
  if (!paused && !slides[index]?.final) {
    elapsed += now - started;
    if (elapsed >= SLIDE_MS) go(index + 1);
  }
  started = now;
  paintBars();
  timer = requestAnimationFrame(loop);
}

function setPaused(v) {
  paused = v;
  $('pause').textContent = paused ? '▶' : '❚❚';
  $('pause').setAttribute('aria-label', paused ? 'Reanudar' : 'Pausar');
}

async function main() {
  const st = await loadAll();
  const { profile } = profileFor(st, st.data);
  applyTheme(profile.theme);
  const params = new URLSearchParams(location.search);
  const id = params.get('periodo') && parsePeriod(params.get('periodo')) ? params.get('periodo') : latestPeriods()[0];
  const w = computeWrapped(st.data, st.catalog, id, allGames(st.catalog, st.settings));
  document.title = `${BRAND.name} Wrapped · ${w.period.label}`;
  slides = build(w, profile, st);
  fill($('slides'), slides.map((s) => s.node));
  fill($('bars'), slides.map(() => el('span', {}, el('i'))));
  go(0);
  cancelAnimationFrame(timer);
  timer = requestAnimationFrame(loop);
}

$('tap-next').addEventListener('click', () => go(index + 1));
$('tap-prev').addEventListener('click', () => go(index - 1));
$('pause').addEventListener('click', () => setPaused(!paused));
$('close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('select')) return;
  if (e.key === 'ArrowRight') go(index + 1);
  else if (e.key === 'ArrowLeft') go(index - 1);
  else if (e.key === ' ') {
    e.preventDefault();
    setPaused(!paused);
  } else if (e.key === 'Escape') $('close').click();
});
// Mantener pulsado pausa, como en las historias.
$('tap-next').addEventListener('pointerdown', () => setPaused(true));
$('tap-next').addEventListener('pointerup', () => setPaused(false));
document.addEventListener('visibilitychange', () => setPaused(document.hidden));

main();
