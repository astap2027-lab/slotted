// GET /api/auth/google/start: send the person to Google to sign in.
import { json, redirect, randomToken, setCookie, siteOrigin, APP_COOKIE, isAppHash } from '../../../../server/lib.js';

export async function onRequestGet({ request, env }) {
  // All three are needed: without the secret, Google's reply can't be exchanged and sign-in would always fail.
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.DB) return json({ error: 'not_set_up' }, 503);
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${siteOrigin(request)}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const cookies = [setCookie('slotted_oauth', state, 600)];
  // Started from the iPhone home-screen app: remember which app is waiting (only a hash of its secret).
  const app = new URL(request.url).searchParams.get('app');
  if (isAppHash(app)) cookies.push(setCookie(APP_COOKIE, app, 600));
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookies);
}
