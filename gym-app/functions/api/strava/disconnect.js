// POST /api/strava/disconnect
import { json, currentUser, sameOrigin, decrypt } from '../../../server/lib.js';
import { revoke } from '../../../server/strava.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const row = await env.DB.prepare('SELECT refresh_token FROM strava WHERE user_id = ?').bind(user.id).first();
  if (row) await revoke(env, await decrypt(env, row.refresh_token));
  await env.DB.prepare('DELETE FROM strava WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}
