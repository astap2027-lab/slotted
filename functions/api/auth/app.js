// /api/auth/app: the Safari page that finishes signing in the iPhone home-screen app.
// GET shows who is signed in and the app's code, and asks the person to confirm.
// POST (the Yes button) stores the app's hash as a new session; the app then collects it from /api/auth/app-claim.
// Confirming first matters: someone else's sign-in link would otherwise hand them a session.
import {
  currentUser, parseCookies, clearCookie, sameOrigin, APP_COOKIE, isAppHash, appCode, SESSION_SECONDS,
} from '../../../server/lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function page(title, body, cookies = [], status = 200) {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Slotted</title><meta name="color-scheme" content="dark">
<style>body{margin:0;background:#101214;color:#eef1f4;font:16px/1.5 Archivo,system-ui,-apple-system,sans-serif}
main{max-width:420px;margin:0 auto;padding:40px 16px}h1{font-size:24px;margin:0 0 12px}.muted{color:#9aa3ad}
.code{font-size:32px;font-weight:700;letter-spacing:.2em;color:#c5f23d;margin:8px 0 16px}
button,.btn{display:inline-block;background:#c5f23d;color:#121509;border:0;border-radius:12px;padding:12px 18px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
a{color:#c5f23d}</style></head><body><main>${body}</main></body></html>`, { status, headers });
}

const expired = () => page('Sign-in expired', `<h1>This sign-in has expired</h1>
<p class="muted">Go back to the Slotted app on your home screen and tap Sign in again.</p>`, [], 400);

export async function onRequestGet({ request, env }) {
  const h = parseCookies(request)[APP_COOKIE];
  const user = await currentUser(request, env);
  if (!user || !isAppHash(h)) return expired();
  return page('Finish signing in', `<h1>Finish signing in the app</h1>
<p>Signed in as <b>${esc(user.name || user.email)}</b>.</p>
<p class="muted">Your Slotted app on the home screen should show this code:</p>
<p class="code">${appCode(h)}</p>
<p class="muted">Only continue if you just tapped Sign in in the Slotted app and the codes match.</p>
<form method="post"><button type="submit">Yes, sign in the app</button></form>`);
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return page('Not allowed', '<h1>Not allowed</h1>', [], 403);
  const h = parseCookies(request)[APP_COOKIE];
  const user = await currentUser(request, env);
  if (!user || !isAppHash(h)) return expired();
  const now = Math.floor(Date.now() / 1000);
  const taken = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(h).first();
  if (!taken) {
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(h, user.id, now + SESSION_SECONDS).run();
  } else if (taken.user_id !== user.id) return expired();
  return page('Signed in', `<h1>Done</h1>
<p>Go back to the Slotted app on your home screen. It finishes signing in by itself.</p>
<p class="muted">You can close this page.</p>`, [clearCookie(APP_COOKIE)]);
}
