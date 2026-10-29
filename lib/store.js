import { migrate } from './core.js';

export const DEFAULT_SETTINGS = {
  idleMinutes: 3, // sin tocar ratón ni teclado durante este tiempo = no cuenta
  disabled: [], // ids de juegos que no se cronometran
  customGames: [], // [{ id, name, emoji, domains: [] }]
  notifications: true, // avisos de logros y niveles
  toastInPage: true, // tarjeta tipo consola dentro de la sede
  sound: true,
  systemNotifications: true, // si no se puede mostrar en la página, notificación del sistema
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
