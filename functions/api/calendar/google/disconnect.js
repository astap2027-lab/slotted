// POST /api/calendar/google/disconnect: stop writing to Google Calendar and give back the permission.
// The "Slotted" calendar stays in their Google account; they can delete it there.
import { json, currentUser, sameOrigin, decrypt } from '../../../../server/lib.js';
import { revokeGoogle } from '../../../../server/gcal.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const row = await env.DB.prepare('SELECT refresh_token FROM google_calendar WHERE user_id = ?').bind(user.id).first().catch(() => null);
  if (row) await revokeGoogle(await decrypt(env, row.refresh_token).catch(() => ''));
  await env.DB.prepare('DELETE FROM google_calendar WHERE user_id = ?').bind(user.id).run().catch(() => {});
  return json({ ok: true });
}
