// Cuentas (Supabase Auth con Google) y llamadas a la base de datos, sin librerías externas.
//
// Inicio de sesión: flujo OAuth con PKCE a través de chrome.identity.launchWebAuthFlow. Google
// devuelve a Supabase, Supabase devuelve a https://<id-extensión>.chromiumapp.org/?code=… y aquí se
// cambia ese código por la sesión. La sesión (tokens) se guarda en chrome.storage.local y se renueva
// sola antes de caducar. Todo lo que se lee o escribe pasa por los permisos por fila de la base de datos.

import { SUPABASE } from '../config.js';

const AUTH = `${SUPABASE.url}/auth/v1`;
const REST = `${SUPABASE.url}/rest/v1`;

// ---------- Sesión ----------

export async function getSession() {
  const { cloudSession } = await chrome.storage.local.get('cloudSession');
  return cloudSession || null;
}

function toSession(s) {
  const meta = s.user?.user_metadata || {};
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: { id: s.user?.id, email: s.user?.email || '', name: meta.full_name || meta.name || '' },
  };
}

async function authPost(path, body, token) {
  const res = await fetch(`${AUTH}${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || json.message || `Error ${res.status}`);
  return json;
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function signIn() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const redirect = chrome.identity.getRedirectURL();
  const url = `${AUTH}/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=s256`;
  const back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const u = new URL(back);
  const err = u.searchParams.get('error_description') || new URLSearchParams(u.hash.slice(1)).get('error_description');
  if (err) throw new Error(err);
  const code = u.searchParams.get('code');
  if (!code) throw new Error('Google no ha devuelto el código de acceso.');
  const session = toSession(await authPost('/token?grant_type=pkce', { auth_code: code, code_verifier: verifier }));
  await chrome.storage.local.set({ cloudSession: session });
  return session;
}

// Token válido (lo renueva si caduca en menos de 2 minutos). Sin sesión, null.
export async function getAccessToken() {
  const s = await getSession();
  if (!s) return null;
  if (s.expires_at * 1000 - Date.now() > 120_000) return s.access_token;
  try {
    const fresh = toSession(await authPost('/token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
    await chrome.storage.local.set({ cloudSession: { ...fresh, user: { ...s.user, ...fresh.user } } });
    return fresh.access_token;
  } catch (e) {
    // La sesión ya no vale (revocada o caducada del todo): hay que volver a entrar.
    if (/refresh|token|session|expired|invalid/i.test(e.message)) await chrome.storage.local.remove('cloudSession');
    throw e;
  }
}

// Cerrar sesión: se olvida la sesión y lo descargado de otros PCs. Lo de este PC se queda.
export async function signOut() {
  const s = await getSession();
  if (s) await authPost('/logout?scope=local', {}, s.access_token).catch(() => {});
  await chrome.storage.local.remove(['cloudSession', 'cloud']);
}

// ---------- Base de datos (PostgREST) ----------

export async function api(path, { method = 'GET', body, prefer } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Sin sesión');
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: {
      apikey: SUPABASE.key,
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Error ${res.status} en ${path.split('?')[0]}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Subida idempotente por lotes: si la fila existe se actualiza (o se ignora, si ignore=true).
export async function upsert(table, rows, onConflict, { ignore = false } = {}) {
  for (let i = 0; i < rows.length; i += 500) {
    await api(`/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: rows.slice(i, i + 500),
      prefer: `resolution=${ignore ? 'ignore' : 'merge'}-duplicates,return=minimal`,
    });
  }
}

// Lectura paginada (PostgREST devuelve como mucho 1.000 filas por petición).
export async function selectAll(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export const deleteMyAccount = () => api('/rpc/delete_my_account', { method: 'POST', body: {} });
