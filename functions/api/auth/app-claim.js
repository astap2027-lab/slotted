// POST /api/auth/app-claim { secret }: the iPhone home-screen app collects its session once the person
// has confirmed in Safari (/api/auth/app). The session's stored hash is SHA-256 of this secret, so the
// secret is the session token and becomes the app's sign-in cookie.
import { json, sameOrigin, sha256, setCookie, SESSION_COOKIE, SESSION_SECONDS } from '../../../server/lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'not_set_up' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const secret = body && body.secret;
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return json({ error: 'bad_request' }, 400);
  const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await sha256(secret), Math.floor(Date.now() / 1000)).first();
  if (!row) return json({ ok: false });
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESSION_COOKIE, secret, SESSION_SECONDS) });
}
