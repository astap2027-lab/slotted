// GET /api/strava/activities?after=<epoch seconds>: this person's Strava activities since then.
import { json, currentUser } from '../../../server/lib.js';
import { accessTokenFor, simplify } from '../../../server/strava.js';

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const after = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get('after')) || 0));
  let token;
  try { token = await accessTokenFor(env, user.id); } catch { return json({ error: 'reconnect' }, 401); }
  if (!token) return json({ error: 'not_connected' }, 404);
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=60`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return json({ error: 'reconnect' }, 401);
  if (res.status === 429) return json({ error: 'busy' }, 429);
  if (!res.ok) return json({ error: 'upstream_error' }, 502);
  const list = await res.json();
  return json({ activities: (Array.isArray(list) ? list : []).map(simplify) });
}
