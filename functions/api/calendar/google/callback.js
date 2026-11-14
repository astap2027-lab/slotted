// GET /api/calendar/google/callback: Google sends the person back here after they allow (or refuse) access.
import { redirect, parseCookies, clearCookie, currentUser, siteOrigin } from '../../../../server/lib.js';
import { googleToken, saveConnection, GCAL_SCOPE } from '../../../../server/gcal.js';

const back = (result) => redirect(`/?gcal=${result}#profile`, [clearCookie('slotted_gcal')]);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back('cancelled');
  const user = await currentUser(request, env);
  if (!user) return back('signin');
  if (!url.searchParams.get('state') || url.searchParams.get('state') !== parseCookies(request).slotted_gcal) return back('failed');
  try {
    const t = await googleToken(env, { code: url.searchParams.get('code'), grant_type: 'authorization_code', redirect_uri: `${siteOrigin(request)}/api/calendar/google/callback` });
    if (!String(t.scope || '').split(' ').includes(GCAL_SCOPE)) return back('noscope');
    if (!t.refresh_token) return back('failed');
    await saveConnection(env, user.id, t);
  } catch {
    return back('failed');
  }
  return back('connected');
}
