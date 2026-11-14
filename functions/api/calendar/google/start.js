// GET /api/calendar/google/start: ask Google for permission to keep a "Slotted" calendar in the person's account.
import { json, redirect, randomToken, setCookie, siteOrigin, currentUser } from '../../../../server/lib.js';
import { GCAL_SCOPE } from '../../../../server/gcal.js';

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_KEY || !env.DB) return json({ error: 'not_set_up' }, 503);
  if (!await currentUser(request, env)) return redirect('/?gcal=signin#profile');
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${siteOrigin(request)}/api/calendar/google/callback`,
    response_type: 'code',
    scope: GCAL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, [setCookie('slotted_gcal', state, 600)]);
}
