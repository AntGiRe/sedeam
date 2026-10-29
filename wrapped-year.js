// Pantallas del Wrapped anual: colores intensos, formas en movimiento, números que cuentan solos.
import { fmtDur, fmtHours, parseKey } from './lib/core.js';
import { yearUnlockDate } from './lib/wrapped.js';
import { capsule, el } from './lib/view.js';
import { BRAND } from './config.js';

const MONTH_ABBR = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_QUIPS = {
  0: 'La cuesta de enero, versión 390 y 190.',
  3: 'Campaña de la Renta y cierre del 1T a la vez. Clásico.',
  4: 'En plena Renta. Tu borrador favorito eras tú.',
  5: 'Junio y la Renta apurando plazos. Lo sabíamos.',
  6: 'Julio: el 2T no perdona ni con calor.',
  7: '¿Agosto? ¿En serio? Nadie te lo va a agradecer, pero aquí queda.',
  9: 'Octubre y su día 20. Nada más que añadir.',
  11: 'Diciembre: cerrando el año antes de que el año te cierre a ti.',
};

// Número que "cuenta" hasta su valor al aparecer (ver countUp en wrapped.js).
const count = (value, fmt = 'int') => el('span', { 'data-count': value, 'data-fmt': fmt }, '0');

// Cada pantalla: { c1, c2, ink, node }. c1 es el fondo, c2 el color de las formas, ink el del texto.
export function buildYear(w, profile, { finalSlide }) {
  const out = [];
  const add = (c1, c2, ink, ...children) => out.push({ c1, c2, ink, node: el('div', { class: 'slide reveal' }, ...children) });
  const y = w.period.name;
  const top = w.ranking[0];

  if (!w.totalMs) {
    add('#1e3264', '#ff4632', '#fff', el('div', { class: 'year-digits' }, y), el('div', { class: 'big' }, 'Un año en blanco'), el('div', { class: 'soft' }, 'Ni un minuto en sedes en todo el año. O eres un genio de la automatización, o esto no es tu ordenador.'));
    out.push(finalSlide());
    return out;
  }

  add('#ff4632', '#1e3264', '#fff',
    el('div', { class: 'k' }, `${profile.avatar} ${profile.name}`),
    el('div', { class: 'year-digits', 'aria-label': y }, [...y].map((d, i) => el('span', { style: `animation-delay:${0.15 + i * 0.12}s` }, d))),
    el('div', { class: 'big' }, 'fue tu año en la sede'),
  );

  const change = w.change == null ? null : w.change >= 0 ? `▲ ${Math.round(w.change * 100)} % más que en ${Number(y) - 1}` : `▼ ${Math.round(-w.change * 100)} % menos que en ${Number(y) - 1}`;
  add('#cdf564', '#2d46b9', '#111',
    el('div', { class: 'k' }, 'Este año pasaste'),
    el('div', { class: 'mega' }, count(Math.round(w.totalMs / 60000))),
    el('div', { class: 'big' }, 'minutos en sedes'),
    w.equivalence ? el('div', { class: 'med' }, `${w.equivalence.emoji} Lo mismo que ${w.equivalence.text}.`) : null,
    change ? el('span', { class: `pill ${w.change >= 0 ? 'up' : 'down'}` }, change) : null,
  );

  add('#2d46b9', '#f573a0', '#fff',
    el('div', { class: 'k' }, 'Tu top de sedes'),
    el('div', { class: 'top5' }, w.ranking.slice(0, 5).map((r, i) => el('div', { class: 'row', style: `animation-delay:${0.2 + i * 0.18}s` }, el('span', { class: 'n' }, i + 1), capsule(r.game, { mini: true, style: 'width:46px' }), el('div', {}, el('b', {}, r.game.name), el('span', {}, `${fmtHours(r.ms)} · ${Math.round(r.share * 100)} %`))))),
  );

  add(top.game.color, '#0b0710', '#fff',
    el('div', { class: 'k' }, `Tu sede nº 1 de ${y}`),
    el('div', { class: 'cap-reveal' }, capsule(top.game, { style: 'width:170px;font-size:15px' })),
    el('div', { class: 'big' }, top.game.name),
    el('div', { class: 'med' }, el('span', {}, count(Math.round(top.ms / 3_600_000))), ' horas juntos'),
    el('span', { class: 'pill' }, `${Math.round(top.share * 100)} % de tu año${top.share > 0.7 ? ' · esto ya es una relación' : ''}`),
  );

  if (w.topMonth != null) {
    const max = Math.max(...w.months);
    add('#ffc864', '#ff4632', '#1a1205',
      el('div', { class: 'k' }, 'Tu año, mes a mes'),
      el('div', { class: 'months' }, w.months.map((ms, i) => el('div', { class: `m${i === w.topMonth ? ' top' : ''}` }, el('i', { style: `--h:${max ? Math.max(3, (ms / max) * 100) : 3}%;animation-delay:${0.1 + i * 0.06}s` }), el('span', {}, MONTH_ABBR[i])))),
      el('div', { class: 'big' }, `Tu mes estrella: ${w.monthName}`),
      el('div', { class: 'soft' }, `${fmtHours(w.months[w.topMonth])}. ${MONTH_QUIPS[w.topMonth] || 'Un mes para enmarcar.'}`),
    );
  }

  if (w.seasons?.length) {
    const medal = (t) => (t >= 30 ? '🥇' : t >= 15 ? '🥈' : t >= 5 ? '🥉' : '·');
    add('#9b59ff', '#00e0c6', '#fff',
      el('div', { class: 'k' }, 'Tus cuatro temporadas'),
      el('div', { class: 'seasons4' }, w.seasons.map((s, i) => el('div', { style: `--sc:${s.color};animation-delay:${0.2 + i * 0.15}s` }, el('span', { class: 'e' }, s.emoji), el('b', {}, s.quarter), el('span', { class: 't' }, `Nivel ${s.tier}`), el('span', { class: 'md' }, medal(s.tier))))),
      el('span', { class: 'pill' }, `🏆 Mejor: ${[...w.seasons].sort((a, b) => b.tier - a.tier)[0].name}`),
    );
  }

  const up = w.levelEnd.level > w.levelStart.level;
  add('#f037a5', '#1e3264', '#fff',
    el('div', { class: 'k' }, 'Tu carrera este año'),
    el('div', { class: 'journey' },
      el('div', { class: 'from' }, el('span', {}, `Nivel ${w.levelStart.level}`), el('b', {}, w.levelStart.title)),
      el('div', { class: 'arrow', 'aria-hidden': 'true' }, up ? '⤵' : '='),
      el('div', { class: 'to' }, el('span', {}, `Nivel ${w.levelEnd.level}`), el('b', {}, w.levelEnd.title)),
    ),
    el('span', { class: 'pill' }, up ? `⬆️ ${w.levelEnd.level - w.levelStart.level === 1 ? '1 ascenso' : `${w.levelEnd.level - w.levelStart.level} ascensos`} este año` : 'Mismo rango: constancia pura'),
  );

  if (w.hero || w.bestDay) {
    const heroDay = w.hero && w.hero.ms ? w.hero : null;
    add('#ff7a2f', '#3a0d1e', '#fff',
      el('div', { class: 'k' }, heroDay ? 'Tu día de plazo más heroico' : 'Tu día más intenso'),
      el('div', { class: 'big' }, parseKey((heroDay || w.bestDay).day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
      heroDay ? el('div', { class: 'med' }, heroDay.title) : null,
      el('div', { class: 'mega', style: 'font-size:64px' }, fmtDur((heroDay || w.bestDay).ms)),
      el('div', { class: 'stats3' },
        el('div', {}, el('b', {}, count(w.daysActive)), el('span', {}, 'días en la sede')),
        el('div', {}, el('b', {}, count(w.streakBest)), el('span', {}, 'de racha máxima')),
        el('div', {}, el('b', {}, w.favWeekday || '—'), el('span', {}, 'tu día favorito')),
      ),
    );
  }

  if (w.loadingMs || w.outages) {
    add('#111111', '#e66767', '#fff',
      el('div', { class: 'k' }, 'Lo que no sale en la nómina'),
      el('div', { class: 'stats3' },
        el('div', {}, el('b', {}, fmtDur(w.loadingMs)), el('span', {}, '⏳ identificándote')),
        el('div', {}, el('b', {}, count(w.outages)), el('span', {}, '💥 caídas')),
        el('div', {}, el('b', {}, fmtDur(w.rushMs)), el('span', {}, '🔥 antes de plazo')),
      ),
      w.worstOutage ? el('div', { class: 'big' }, `${w.worstOutage.emoji} ${w.worstOutage.name}`) : null,
      w.worstOutage ? el('div', { class: 'soft' }, `La que más te falló: ${w.worstOutage.n} ${w.worstOutage.n === 1 ? 'caída' : 'caídas'}.`) : el('div', { class: 'soft' }, 'Ni una caída en todo el año.'),
    );
  }

  if (w.achievements.length || w.challenges) {
    add('#e8b64c', '#6e3f1c', '#1a1205',
      el('div', { class: 'k' }, 'Tu vitrina del año'),
      el('div', { class: 'mega', style: 'font-size:96px' }, count(w.achievements.length)),
      el('div', { class: 'big' }, `${w.achievements.length === 1 ? 'logro' : 'logros'}${w.challenges ? ` y ${w.challenges} ${w.challenges === 1 ? 'reto' : 'retos'}` : ''}`),
      el('div', { class: 'badges dark' }, w.achievements.slice(0, 9).map((a) => el('span', {}, el('i', { 'aria-hidden': 'true' }, a.emoji), a.name))),
    );
  }

  add('#0b0710', w.aura[0], '#fff',
    el('div', { class: 'k' }, 'Tu aura fiscal'),
    el('div', { class: 'aura', style: `--a1:${w.aura[0]};--a2:${w.aura[1]}`, 'aria-hidden': 'true' }, el('span', {}, w.personality.emoji)),
    el('div', { class: 'big' }, w.personality.name),
    el('div', { class: 'soft' }, w.personality.desc),
  );

  out.push(finalSlide());
  return out;
}

// Antes de la segunda semana de diciembre: cuenta atrás.
export function buildLocked(w, now = new Date()) {
  const y = Number(w.period.id);
  const unlock = yearUnlockDate(y);
  const days = Math.ceil((unlock - now) / 86_400_000);
  return [{
    c1: '#1e3264',
    c2: '#ff4632',
    ink: '#fff',
    final: true,
    node: el(
      'div',
      { class: 'slide reveal locked' },
      el('div', { class: 'emoji-xl' }, '🔒'),
      el('div', { class: 'k' }, `${BRAND.name} Wrapped ${y}`),
      el('div', { class: 'big' }, 'Se está cocinando…'),
      el('div', { class: 'mega', style: 'font-size:84px' }, `${days} ${days === 1 ? 'día' : 'días'}`),
      el('div', { class: 'soft' }, `Se desbloquea el ${unlock.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`),
      w.totalMs ? el('div', { class: 'soft' }, `Pista: ya llevas ${fmtHours(w.totalMs)} este año 🤫`) : null,
    ),
  }];
}
