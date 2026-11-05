// Shared helpers for the Cloudflare Pages Functions in /functions.

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

export const siteOrigin = (request) => new URL(request.url).origin;

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const setCookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearCookie = (name) => setCookie(name, '', 0);

// Requests that change data must come from this site's own pages.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === siteOrigin(request);
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function decodeJwtPayload(jwt) {
  const part = String(jwt).split('.')[1];
  return JSON.parse(new TextDecoder().decode(fromB64url(part)));
}

// ---------- sessions ----------
export const SESSION_COOKIE = 'slotted_session';
const SESSION_SECONDS = 60 * 60 * 24 * 60;
const now = () => Math.floor(Date.now() / 1000);

export async function createSession(env, userId) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, now() + SESSION_SECONDS).run();
  return setCookie(SESSION_COOKIE, token, SESSION_SECONDS);
}

export async function currentUser(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  return env.DB.prepare(
    'SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  ).bind(await sha256(token), now()).first();
}

export async function endSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return clearCookie(SESSION_COOKIE);
}

// ---------- encrypting stored tokens ----------
// TOKEN_KEY is 32 random bytes, base64 encoded. Generate one with: openssl rand -base64 32
async function aesKey(env) {
  if (!env.TOKEN_KEY) throw new Error('TOKEN_KEY is not set');
  const raw = Uint8Array.from(atob(env.TOKEN_KEY), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text));
  return `${b64url(iv)}.${b64url(new Uint8Array(data))}`;
}

export async function decrypt(env, payload) {
  const [iv, data] = String(payload).split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(env), fromB64url(data));
  return new TextDecoder().decode(plain);
}
