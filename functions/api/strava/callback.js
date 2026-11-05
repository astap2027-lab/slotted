// GET /api/strava/callback: Strava sends the person back here after they connect.
import { redirect, parseCookies, clearCookie, currentUser } from '../../../server/lib.js';
import { stravaToken, saveTokens } from '../../../server/strava.js';

const back = (result) => redirect(`/?strava=${result}#profile`, [clearCookie('slotted_strava')]);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back('cancelled');
  const user = await currentUser(request, env);
  if (!user) return back('signin');
  if (!url.searchParams.get('state') || url.searchParams.get('state') !== parseCookies(request).slotted_strava) return back('failed');
  const granted = (url.searchParams.get('scope') || '').split(/[ ,]/);
  if (!granted.includes('activity:read_all') && !granted.includes('activity:read')) return back('noscope');
  try {
    const t = await stravaToken(env, { code: url.searchParams.get('code'), grant_type: 'authorization_code' });
    await saveTokens(env, user.id, t, t.athlete || { id: 'unknown' });
  } catch {
    return back('failed');
  }
  return back('connected');
}
