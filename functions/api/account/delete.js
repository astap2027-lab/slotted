// POST /api/account/delete: remove the account and everything stored with it.
import { json, currentUser, sameOrigin, endSession, decrypt } from '../../../server/lib.js';
import { revoke } from '../../../server/strava.js';
import { revokeGoogle } from '../../../server/gcal.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const strava = await env.DB.prepare('SELECT access_token FROM strava WHERE user_id = ?').bind(user.id).first();
  if (strava) await revoke(env, await decrypt(env, strava.access_token));
  const gcal = await env.DB.prepare('SELECT refresh_token FROM google_calendar WHERE user_id = ?').bind(user.id).first().catch(() => null);
  if (gcal) await revokeGoogle(await decrypt(env, gcal.refresh_token).catch(() => ''));
  await env.DB.prepare('DELETE FROM google_calendar WHERE user_id = ?').bind(user.id).run().catch(() => {});
  for (const table of ['strava', 'user_data', 'sessions']) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id).run();
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return json({ ok: true }, 200, { 'Set-Cookie': await endSession(request, env) });
}
