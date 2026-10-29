// Aviso de logro al estilo de los juegos: tarjeta que sube por la esquina inferior derecha.
//
// Esta función se inyecta TAL CUAL en la página de la sede con chrome.scripting.executeScript,
// así que no puede usar nada de fuera de ella (ni imports ni variables del módulo).
// Los estilos se ponen con el CSSOM (el.style) y dentro de un shadow DOM: así no los bloquea la
// política de seguridad (CSP) de la web ni se mezclan con los estilos de la página.
//
// items: [{ kind: 'ach' | 'level' | 'info', emoji, label, name, desc }]
export function showToasts(items, opts = {}) {
  const HOST_ID = 'sedeam-toasts';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const css = (el, s) => Object.assign(el.style, s);
  const make = (tag, s, text) => {
    const el = document.createElement(tag);
    if (s) css(el, s);
    if (text != null) el.textContent = text;
    return el;
  };

  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = make('div', { position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647', pointerEvents: 'none' });
    host.id = HOST_ID;
    const stack = make('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' });
    host.attachShadow({ mode: 'open' }).appendChild(stack);
    (document.body || document.documentElement).appendChild(host);
  }
  const stack = host.shadowRoot.firstElementChild;

  function chime(kind) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const t0 = ac.currentTime;
      const notes = kind === 'level' ? [523, 659, 784, 1047] : [784, 1175];
      notes.forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        const t = t0 + i * 0.09;
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 0.65);
      });
      setTimeout(() => ac.close(), 1500);
    } catch {
      // Sin audio (p. ej. la página no ha tenido interacción): el aviso se ve igual.
    }
  }

  // Píldora de XP: pequeña, rápida y sin sonido, para no molestar mientras trabajas.
  function pill(it) {
    const card = make('div', {
      pointerEvents: 'auto',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 14px 8px 8px',
      borderRadius: '999px',
      background: 'linear-gradient(135deg, rgba(20,30,44,.96), rgba(36,56,82,.96))',
      boxShadow: '0 8px 24px rgba(0,0,0,.4), inset 0 0 0 1px rgba(139,212,91,.35)',
      font: '12px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#dfe6ee',
      transform: reduced ? 'none' : 'translateY(16px) scale(.9)',
      opacity: '0',
      transition: reduced ? 'opacity .25s' : 'transform .45s cubic-bezier(.2,1.4,.4,1), opacity .25s',
      minWidth: '220px',
      maxWidth: '300px',
    });
    const icon = make('div', { width: '34px', height: '34px', flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '18px', background: 'radial-gradient(circle at 30% 25%, #6cc644, #2f6b1b)', boxShadow: '0 0 12px rgba(139,212,91,.45)' }, it.emoji || '⚡');
    const body = make('div', { minWidth: '0', flex: '1' });
    const top = make('div', { display: 'flex', alignItems: 'baseline', gap: '8px' });
    top.append(
      make('b', { fontSize: '15px', fontWeight: '900', color: '#9be36a', letterSpacing: '.02em', whiteSpace: 'nowrap' }, it.label),
      make('span', { color: '#fff', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, it.name || ''),
    );
    body.append(top);
    if (it.desc) body.append(make('div', { color: '#9fb0c2', fontSize: '11px', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, it.desc));
    let fillEl = null;
    if (typeof it.progress === 'number') {
      const bar = make('div', { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.14)', marginTop: '5px', overflow: 'hidden' });
      const start = Math.max(0, it.progress - 0.0625);
      fillEl = make('div', { height: '100%', width: `${start * 100}%`, borderRadius: '2px', background: 'linear-gradient(90deg, #4e9a2a, #9be36a)', transition: 'width .9s cubic-bezier(.2,.9,.3,1) .35s' });
      bar.append(fillEl);
      body.append(bar);
    }
    card.append(icon, body);
    const close = () => {
      css(card, { opacity: '0', transform: reduced ? 'none' : 'translateY(10px) scale(.95)' });
      setTimeout(() => card.remove(), 400);
    };
    card.addEventListener('click', close);
    stack.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      css(card, { opacity: '1', transform: 'none' });
      if (fillEl) css(fillEl, { width: `${Math.min(1, it.progress) * 100}%` });
    }));
    setTimeout(close, opts.xpDuration || 3800);
  }

  function toast(it) {
    if (it.kind === 'xp') return pill(it);
    const gold = it.kind === 'ach' || it.kind === 'reward';
    const card = make('div', {
      pointerEvents: 'auto',
      cursor: 'pointer',
      width: '320px',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 14px 10px 10px',
      borderRadius: '4px',
      background: 'linear-gradient(135deg, #1a2433 0%, #23344a 55%, #2c4766 100%)',
      boxShadow: '0 10px 30px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.06)',
      font: '13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#dfe6ee',
      textAlign: 'left',
      transform: reduced ? 'none' : 'translateY(calc(100% + 30px))',
      opacity: '0',
      transition: reduced ? 'opacity .3s' : 'transform .5s cubic-bezier(.2,.9,.25,1.15), opacity .35s',
      position: 'relative',
      overflow: 'hidden',
    });
    card.title = 'Cerrar';

    const icon = make('div', {
      width: '58px',
      height: '58px',
      flex: 'none',
      borderRadius: '4px',
      display: 'grid',
      placeItems: 'center',
      fontSize: '32px',
      lineHeight: '1',
      position: 'relative',
      overflow: 'hidden',
      background: gold ? 'radial-gradient(circle at 30% 25%, #3e6592, #1b2a44)' : 'radial-gradient(circle at 30% 25%, #4a8fd9, #1d3d6b)',
      boxShadow: gold ? 'inset 0 0 0 1px rgba(232,182,76,.75), 0 0 14px rgba(232,182,76,.25)' : 'inset 0 0 0 1px rgba(90,169,230,.7)',
    }, it.emoji || '🏆');
    // Brillo que cruza el icono una vez, como en las consolas.
    const shine = make('div', {
      position: 'absolute', top: '0', bottom: '0', left: '-60%', width: '50%',
      background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)',
      transform: 'skewX(-20deg)', transition: 'left .9s ease-out .35s',
    });
    icon.appendChild(shine);

    const body = make('div', { minWidth: '0', flex: '1' });
    const top = make('div', { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: '700', letterSpacing: '.12em', textTransform: 'uppercase', color: gold ? '#e8b64c' : '#7fbfff' });
    top.append(make('span', null, it.label || '¡Logro desbloqueado!'));
    const name = make('div', { fontWeight: '700', fontSize: '14px', color: '#ffffff', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, it.name || '');
    const desc = make('div', { fontSize: '11.5px', color: '#9fb0c2', marginTop: '2px', display: '-webkit-box', webkitLineClamp: '2', webkitBoxOrient: 'vertical', overflow: 'hidden' }, it.desc || '');
    const brand = make('div', { position: 'absolute', right: '10px', top: '8px', fontSize: '9px', fontWeight: '800', letterSpacing: '.22em', color: 'rgba(255,255,255,.28)' }, (opts.brand || 'SEDEAM').toUpperCase());
    body.append(top, name, desc);
    card.append(icon, body, brand);

    const close = () => {
      css(card, { transform: reduced ? 'none' : 'translateX(120%)', opacity: '0' });
      setTimeout(() => card.remove(), 500);
    };
    card.addEventListener('click', close);
    stack.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      css(card, { transform: 'none', opacity: '1' });
      css(shine, { left: '120%' });
    }));
    if (opts.sound !== false) chime(it.kind);
    setTimeout(close, opts.duration || 7000);
  }

  items.forEach((it, i) => setTimeout(() => toast(it), i * (it.kind === 'xp' ? 600 : 1100)));
  return true;
}
