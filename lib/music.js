// Banda sonora del Wrapped anual: un bucle synth-pop suave generado con Web Audio (sin archivos).
// Acordes, bajo, arpegio y un bombo discreto a 100 pulsaciones por minuto. Solo arranca tras un
// clic del usuario (los navegadores no dejan sonar nada antes).

const BPM = 100;
const BEAT = 60 / BPM;
// Lam – Fa – Do – Sol (vi–IV–I–V), la progresión de media música pop.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export function createMusic() {
  let ac = null;
  let master = null;
  let timer = null;
  let nextBar = 0;
  let bar = 0;

  function voice(freq, t, dur, { type = 'sine', gain = 0.1, attack = 0.02, release = 0.3, dest = master } = {}) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function kick(t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  }

  function scheduleBar(t) {
    const chord = CHORDS[bar % CHORDS.length];
    const len = BEAT * 4;
    // Colchón de acorde
    for (const n of chord) voice(midi(n), t, len, { type: 'triangle', gain: 0.035, attack: 0.25, release: 0.5 });
    // Bajo en negras
    for (let i = 0; i < 4; i++) voice(midi(chord[0] - 12), t + i * BEAT, BEAT * 0.9, { type: 'sine', gain: 0.09, release: 0.15 });
    // Arpegio en corcheas, una octava arriba
    const arp = [0, 1, 2, 1, 0, 1, 2, 1];
    arp.forEach((k, i) => voice(midi(chord[k] + 12), t + i * (BEAT / 2), BEAT / 2, { type: 'square', gain: 0.018, release: 0.12 }));
    // Bombo en 1 y 3 (y en 2 y 4 a partir de la segunda vuelta, para que vaya creciendo)
    kick(t);
    kick(t + 2 * BEAT);
    if (bar >= 4) {
      kick(t + BEAT);
      kick(t + 3 * BEAT);
    }
    bar++;
  }

  function pump() {
    // Programa con un compás de antelación para que no haya cortes.
    while (nextBar < ac.currentTime + BEAT * 4) {
      scheduleBar(nextBar);
      nextBar += BEAT * 4;
    }
  }

  return {
    get playing() {
      return !!timer;
    },
    start() {
      if (timer) return;
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      ac.resume();
      master = ac.createGain();
      master.gain.value = 0.0001;
      master.gain.exponentialRampToValueAtTime(0.8, ac.currentTime + 1.5);
      master.connect(ac.destination);
      nextBar = ac.currentTime + 0.1;
      bar = 0;
      pump();
      timer = setInterval(pump, 250);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      const m = master;
      m.gain.cancelScheduledValues(ac.currentTime);
      m.gain.setValueAtTime(m.gain.value, ac.currentTime);
      m.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
      setTimeout(() => m.disconnect(), 800);
    },
  };
}
