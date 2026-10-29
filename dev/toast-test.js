import { showToasts } from '../lib/toast.js';
showToasts([
  { kind: 'ach', emoji: '📅', label: '¡Logro desbloqueado!', name: 'Superviviente del día 20', desc: '2 horas en la AEAT un último día de trimestre (20 de abril, julio u octubre, o 30 de enero).' },
  { kind: 'level', emoji: '⬆️', label: '¡Nivel 8!', name: 'Asesor fiscal', desc: 'Has subido de rango. Sigue así (o no).' },
], { sound: false, duration: 60000 });
