// Tarjeta para compartir: una imagen 1080×1350 (formato vertical de redes y WhatsApp) dibujada en
// un canvas, sin servicios externos. Devuelve el canvas para descargarlo o copiarlo.

import { fmtHours, parseKey } from './core.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export function drawShareCard(w, profile, { brand = 'SEDEAM' } = {}) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const c1 = w.ranking[0]?.game.color || '#2a78d6';

  // Fondo: degradado con el color del juego favorito y textura diagonal.
  ctx.fillStyle = '#0a0f15';
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 1.1);
  g.addColorStop(0, `${c1}ee`);
  g.addColorStop(1, `${c1}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(0, H, 0, 0, H, W);
  g.addColorStop(0, '#6250d6aa');
  g.addColorStop(1, '#6250d600');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 3;
  for (let x = -H; x < W; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }

  const pad = 84;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `900 30px ${FONT}`;
  ctx.letterSpacing = '10px';
  ctx.fillText(brand, pad, 120);
  ctx.textAlign = 'right';
  ctx.fillText(`${w.period.label.toUpperCase()}`, W - pad, 120);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  // Jugador
  roundRect(ctx, pad, 170, 150, 150, 24);
  const ag = ctx.createLinearGradient(pad, 170, pad + 150, 320);
  ag.addColorStop(0, '#2a78d6');
  ag.addColorStop(1, '#6250d6');
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.font = `92px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(profile.avatar, pad + 75, 280);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `800 54px ${FONT}`;
  ctx.fillText(fitText(ctx, profile.name, W - pad * 2 - 190), pad + 186, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(fitText(ctx, profile.titleText.toUpperCase(), W - pad * 2 - 190), pad + 186, 290);

  // Cifra gorda
  ctx.fillStyle = '#fff';
  ctx.font = `900 200px ${FONT}`;
  ctx.fillText(fmtHours(w.totalMs).replace(' h', ''), pad - 8, 560);
  const numW = ctx.measureText(fmtHours(w.totalMs).replace(' h', '')).width;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText('h', pad + numW + 8, 560);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(w.period.kind === 'year' ? 'en sedes este año' : `en sedes en ${w.period.name}`, pad, 620);
  if (w.equivalence) {
    ctx.font = `500 30px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${w.equivalence.emoji} Eso son ${w.equivalence.text}`, pad, 668);
  }

  // Top 3
  let y = 750;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `800 26px ${FONT}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('TUS SEDES', pad, y);
  ctx.letterSpacing = '0px';
  y += 26;
  const top = w.ranking.slice(0, 3);
  const max = top[0]?.ms || 1;
  for (const [i, r] of top.entries()) {
    y += 70;
    ctx.fillStyle = '#fff';
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(`${i + 1}  ${r.game.emoji} ${fitText(ctx, r.game.name, 560)}`, pad, y);
    ctx.textAlign = 'right';
    ctx.fillText(fmtHours(r.ms), W - pad, y);
    ctx.textAlign = 'left';
    roundRect(ctx, pad, y + 16, W - pad * 2, 12, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    roundRect(ctx, pad, y + 16, Math.max(12, (W - pad * 2) * (r.ms / max)), 12, 6);
    ctx.fillStyle = r.game.color;
    ctx.fill();
  }
  if (!top.length) {
    y += 70;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText('Ni un minuto en sedes. Envidiable.', pad, y);
  }

  // Personalidad
  y = 1080;
  roundRect(ctx, pad, y, W - pad * 2, 130, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,182,76,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff'; // los emojis heredan la opacidad del relleno: opacos
  ctx.font = `76px ${FONT}`;
  ctx.fillText(w.personality.emoji, pad + 28, y + 95);
  ctx.fillStyle = 'rgba(232,182,76,1)';
  ctx.font = `800 24px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillText('TU PERSONALIDAD GESTORIL', pad + 140, y + 52);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#fff';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(fitText(ctx, w.personality.name, W - pad * 2 - 170), pad + 140, y + 100);

  // Pie
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `600 26px ${FONT}`;
  const bits = [
    w.bestDay ? `Mejor día: ${parseKey(w.bestDay.day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} (${fmtHours(w.bestDay.ms)})` : null,
    `${w.daysActive} días en la sede`,
    w.outages ? `${w.outages} caídas` : null,
  ].filter(Boolean);
  ctx.fillText(bits.join('  ·  '), pad, H - 70);
  ctx.textAlign = 'right';
  ctx.fillText(brand.toLowerCase(), W - pad, H - 70);
  ctx.textAlign = 'left';
  return canvas;
}
