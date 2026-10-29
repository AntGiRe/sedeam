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

  function toast(it) {
    const gold = it.kind === 'ach';
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

  items.forEach((it, i) => setTimeout(() => toast(it), i * 1100));
  return true;
}
