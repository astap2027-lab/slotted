// POST /api/auth/logout
import { json, endSession, sameOrigin } from '../../../server/lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': await endSession(request, env) });
}
