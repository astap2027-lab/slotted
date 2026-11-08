// GET /api/auth/google/start: send the person to Google to sign in.
import { json, redirect, randomToken, setCookie, siteOrigin } from '../../../../server/lib.js';

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
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, [setCookie('slotted_oauth', state, 600)]);
}
