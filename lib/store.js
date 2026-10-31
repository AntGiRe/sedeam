import { migrate } from './core.js';

export const DEFAULT_SETTINGS = {
  idleMinutes: 3, // sin tocar ratón ni teclado durante este tiempo = no cuenta
  disabled: [], // ids de juegos que no se cronometran
  customGames: [], // [{ id, name, emoji, domains: [] }]
  notifications: true, // avisos de logros y niveles
  toastInPage: true, // tarjeta tipo consola dentro de la sede
  sound: true,
  systemNotifications: true, // si no se puede mostrar en la página, notificación del sistema
  deadlineAlerts: true, // recordatorios de plazos (N días antes, la víspera y el mismo día)
  deadlineDays: 3,
  profile: {}, // { name, avatar, theme, frame, title, showcase }
  breakReminder: true, // pausa activa: aviso tras mucho rato seguido en sedes
  breakMinutes: 90,
  shortcuts: null, // accesos directos del lanzador; null = los que trae el catálogo
  xpToasts: true, // píldoras de «+15 XP» en la sede mientras trabajas
  ceoView: true, // Modo CEO (solo si tu cuenta está en admins): todo desbloqueado a la vista
};

export async function loadData() {
  const { data } = await chrome.storage.local.get('data');
  return migrate(data);
}

export async function saveData(data) {
  await chrome.storage.local.set({ data });
}

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
