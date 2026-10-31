// Simula chrome.* con datos de ejemplo para ver la interfaz fuera de la extensión (solo desarrollo).
(() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const H = 3600000, M = 60000;
  const days = {}, hours = {}, slots = {};
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const add = (day, g, ms) => {
    (days[day] ||= {})[g] = (days[day][g] || 0) + ms;
    const arr = (hours[g] ||= new Array(24).fill(0));
    const sl = ((slots[day] ||= {})[g] ||= {});
    let left = ms, h = 9 + Math.floor(rnd() * 5);
    while (left > 0) { const c = Math.min(left, H * (0.4 + rnd() * 0.6)); arr[h % 24] += c; sl[h % 24] = (sl[h % 24] || 0) + c; left -= c; h++; }
  };
  const today = new Date();
  for (let i = 300; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const wd = d.getDay();
    if ((wd === 0 || wd === 6) && rnd() > 0.1) continue;
    if (rnd() < 0.08) continue;
    const k = key(d);
    const peak = (d.getDate() >= 14 && d.getDate() <= 20 && [0, 3, 6, 9].includes(d.getMonth())) || (d.getMonth() >= 3 && d.getMonth() <= 5) ? 1.8 : 1;
    add(k, 'aeat', (0.5 + rnd() * 3.5) * H * peak);
    if (rnd() < 0.7) add(k, 'segsocial', (0.1 + rnd() * 1.2) * H);
    if (rnd() < 0.4) add(k, 'dehu', (5 + rnd() * 25) * M);
    if (rnd() < 0.15) add(k, 'catastro', (10 + rnd() * 40) * M);
    if (rnd() < 0.12) add(k, 'registros', (10 + rnd() * 30) * M);
    if (rnd() < 0.06) add(k, 'dgt', (10 + rnd() * 40) * M);
    if (rnd() < 0.2) add(k, 'boe', (5 + rnd() * 20) * M);
  }
  hours.aeat[23] += 40 * M;
  const now = Date.now();
  const data = {
    v: 4, days, hours, slots,
    challenges: { '2026-S43': { intensiva: { ts: now - 5 * 864e5, xp: 3 }, constante: { ts: now - 4 * 864e5, xp: 2 } }, '2026-S42': { 'aeat-sem': { ts: now - 12 * 864e5, xp: 3 } } },
    loading: { [key(today)]: 7 * M, [key(new Date(today.getFullYear(), today.getMonth(), 3))]: 25 * M, '2026-04-20': 4.4 * H },
    outages: { [key(today)]: { aeat: 2, clave: 1 }, '2026-10-20': { aeat: 5, segsocial: 2, redsara: 2, clave: 2 }, '2026-07-20': { aeat: 3 } },
    tabs: { all: { count: 9, ts: now - 9 * 864e5 }, byGame: { aeat: { count: 7, ts: now - 9 * 864e5 }, segsocial: { count: 3, ts: now - 20 * 864e5 } } },
    bestRuns: { aeat: 4.2 * H, segsocial: 1.4 * H, dehu: 0.5 * H },
    run: { game: 'aeat', start: now - 83 * M, last: now - 30000, ms: 83 * M },
    longestRun: { game: 'aeat', ms: 4.2 * H, day: key(new Date(today.getFullYear(), 9, 20)) },
    firstPlayed: { aeat: now - 300 * 864e5, segsocial: now - 298 * 864e5 },
    lastPlayed: { aeat: now - 30000, segsocial: now - 2 * 3600e3, dehu: now - 864e5, boe: now - 3 * 864e5, catastro: now - 12 * 864e5, registros: now - 20 * 864e5, dgt: now - 40 * 864e5 },
    achievements: { bienvenida: now - 290 * 864e5, clave: now - 289 * 864e5, habitual: now - 280 * 864e5, centenario: now - 220 * 864e5, maraton: now - 150 * 864e5, dia20: now - 9 * 864e5, doble: now - 288 * 864e5, racha5: now - 270 * 864e5, noctambulo: now - 40 * 864e5, notificado: now - 200 * 864e5, coleccionista: now - 120 * 864e5 },
  };
  const local = { updateStatus: { running: '0.2.0', published: '0.3.0', checkedAt: now - 20 * 60000 }, data, settings: { idleMinutes: 3, disabled: ['sepe'], customGames: [{ id: 'c_atc', name: 'ATC Canarias', emoji: '🌴', domains: ['gobiernodecanarias.org'] }], notifications: true, profile: { name: 'Antonio', avatar: 'avatar-buho', theme: new URLSearchParams(location.search).get('tema') || 'theme-sede', frame: 'frame-plata', title: 'ach:dia20', showcase: ['dia20', 'noctambulo', 'maraton'] } } };
  // ?cuenta simula una sesión iniciada con dos PCs sincronizados.
  if (location.search.includes('cuenta')) {
    local.cloudSession = { access_token: 'x', refresh_token: 'y', expires_at: now / 1000 + 3600, user: { id: 'u1', email: 'antonio@ejemplo.com', name: 'Antonio Gil' } };
    local.cloud = {
      deviceId: 'pc1', deviceName: 'PC oficina', sent: {}, lastPull: {},
      others: { rows: {}, extras: {}, records: {} },
      devices: [
        { id: 'pc1', name: 'PC oficina', last_sync_at: new Date(now - 2 * 60000).toISOString() },
        { id: 'pc2', name: 'Portátil casa', last_sync_at: new Date(now - 26 * 3600000).toISOString() },
      ],
      status: location.search.includes('error') ? { at: now - 60000, error: 'Failed to fetch' } : { at: now - 2 * 60000, error: null },
    };
  }
  // ?ceo simula una cuenta de la casa (tabla admins): sale el Modo CEO.
  if (location.search.includes('ceo') && local.cloud) local.cloud.admin = true;
  // ?supabase simula que el catálogo ya se ha descargado de Supabase.
  if (location.search.includes('supabase')) local.catalogStatus = { at: now - 3 * 60000, from: 'supabase', error: null };
  // ?vacio simula una instalación recién hecha, sin horas ni logros.
  if (location.search.includes('vacio')) for (const k of Object.keys(local)) delete local[k];
  const session = location.search.includes('vacio') ? {} : { live: { game: 'aeat', start: now - 20000 } };
  const listeners = [];
  const pick = (store, keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in store).map((k) => [k, store[k]]));
  window.chrome = {
    storage: {
      local: { get: async (k) => pick(local, k), set: async (o) => { Object.assign(local, o); const ch = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { newValue: v }])); listeners.forEach((f) => f(ch)); }, remove: async (k) => delete local[k] },
      session: { get: async (k) => pick(session, k), set: async (o) => Object.assign(session, o) },
      onChanged: { addListener: (f) => listeners.push(f) },
    },
    runtime: { sendMessage: async () => true, getURL: (p) => '../' + p, getManifest: () => ({ version: '0.2.0' }) },
    tabs: {
      create: ({ url }) => console.log('abrir', url),
      query: async () => [{ url: 'https://sede.agenciatributaria.gob.es/Sede/iva/modelo-303.html', title: 'Modelo 303 - Agencia Tributaria' }],
    },
  };
})();
