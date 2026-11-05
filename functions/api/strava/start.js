// GET /api/strava/start: send a signed-in person to Strava to connect.
import { json, redirect, randomToken, setCookie, siteOrigin, currentUser } from '../../../server/lib.js';
import { STRAVA_SCOPE } from '../../../server/strava.js';

export async function onRequestGet({ request, env }) {
  if (!env.STRAVA_CLIENT_ID) return json({ error: 'not_set_up' }, 503);
  if (!await currentUser(request, env)) return redirect('/?strava=signin#profile');
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    redirect_uri: `${siteOrigin(request)}/api/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  });
  return redirect(`https://www.strava.com/oauth/authorize?${params}`, [setCookie('slotted_strava', state, 600)]);
}
