// GET /api/sync: this person's saved data. PUT /api/sync: save it.
// A save based on an older copy than the server's is refused with the server's copy, so the app can merge.
import { json, currentUser, sameOrigin } from '../../server/lib.js';

const MAX_BYTES = 900000;

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const row = await env.DB.prepare('SELECT data, updated_at FROM user_data WHERE user_id = ?').bind(user.id).first();
  return json(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 });
}

export async function onRequestPut({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'bad_request' }, 400); }
  if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'bad_request' }, 400);

  const row = await env.DB.prepare('SELECT data, updated_at FROM user_data WHERE user_id = ?').bind(user.id).first();
  if (row && row.updated_at > (Number(body.baseUpdatedAt) || 0)) {
    return json({ error: 'conflict', data: JSON.parse(row.data), updatedAt: row.updated_at }, 409);
  }
  const updatedAt = Math.max(Date.now(), row ? row.updated_at + 1 : 0);
  await env.DB.prepare(
    'INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ).bind(user.id, JSON.stringify(body.data), updatedAt).run();
  return json({ updatedAt });
}
