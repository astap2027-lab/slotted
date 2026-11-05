// GET /api/auth/google/callback: Google sends the person back here after they sign in.
import {
  redirect, parseCookies, clearCookie, siteOrigin, decodeJwtPayload, createSession,
} from '../../../../server/lib.js';

const fail = (why) => redirect(`/?signin=${why}#profile`, [clearCookie('slotted_oauth')]);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return fail('cancelled');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== parseCookies(request).slotted_oauth) return fail('failed');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${siteOrigin(request)}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return fail('failed');
  const { id_token: idToken } = await tokenRes.json();
  if (!idToken) return fail('failed');

  // The ID token came straight from Google over HTTPS, so its claims can be read directly.
  let claims;
  try { claims = decodeJwtPayload(idToken); } catch { return fail('failed'); }
  const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!issuerOk || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub || claims.exp * 1000 < Date.now()) return fail('failed');

  let user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first();
  if (user) {
    await env.DB.prepare('UPDATE users SET email = ?, name = ? WHERE id = ?').bind(claims.email || null, claims.name || null, user.id).run();
  } else {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, claims.sub, claims.email || null, claims.name || null, Math.floor(Date.now() / 1000)).run();
  }
  const session = await createSession(env, user.id);
  return redirect('/?signin=ok#profile', [session, clearCookie('slotted_oauth')]);
}
