import { showToasts } from '../lib/toast.js';
showToasts([
  { kind: 'xp', emoji: '☀️', label: '+10 XP', name: 'Primer fichaje del día', desc: '¡Buenos días! Bonus por entrar en la sede.' },
  { kind: 'xp', emoji: '⚡', label: '+15 XP', name: 'Agencia Tributaria', desc: 'Temporada: nivel 5 · 150/240 XP', progress: 150 / 240 },
  { kind: 'xp', emoji: '🔥', label: '+15 XP', name: '2 h hoy en sedes', desc: 'Temporada: nivel 5 · 165/240 XP', progress: 165 / 240 },
  { kind: 'ach', emoji: '📅', label: '¡Logro desbloqueado!', name: 'Superviviente del día 20', desc: '2 horas en la AEAT un último día de trimestre.' },
], { sound: false, duration: 60000, xpDuration: 60000 });
