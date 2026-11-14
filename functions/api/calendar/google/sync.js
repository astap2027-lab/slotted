// POST /api/calendar/google/sync { events, from, to, timeZone }: make the person's "Slotted" calendar in Google
// match the events the app worked out (gym sessions and the commitments they added in Slotted).
import { json, currentUser, sameOrigin } from '../../../../server/lib.js';
import { connection, ensureCalendar, syncEvents } from '../../../../server/gcal.js';

const ISO = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function cleanEvents(list) {
  return (Array.isArray(list) ? list : []).slice(0, 120).filter((e) => e && typeof e.uid === 'string' && ISO(e.start) && ISO(e.end) && Date.parse(e.end) > Date.parse(e.start))
    .map((e) => ({ uid: e.uid.slice(0, 120), title: String(e.title || 'Slotted').slice(0, 120), start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(), notes: String(e.notes || '').slice(0, 1500) }));
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'signed_out' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!ISO(body.from) || !ISO(body.to) || Date.parse(body.to) - Date.parse(body.from) > 32 * 86400000) return json({ error: 'bad_request' }, 400);
  let conn;
  try { conn = await connection(env, user.id); } catch (e) { return json({ error: e.status === 400 || e.status === 401 ? 'reconnect' : 'unreachable' }, e.status === 400 || e.status === 401 ? 401 : 502); }
  if (!conn) return json({ error: 'not_connected' }, 404);
  try {
    const calendarId = await ensureCalendar(env, user.id, conn, String(body.timeZone || '').slice(0, 60));
    const counts = await syncEvents(conn, calendarId, cleanEvents(body.events), new Date(body.from).toISOString(), new Date(body.to).toISOString());
    return json({ ok: true, ...counts, at: Date.now() });
  } catch (e) {
    if (e.status === 401 || e.status === 403) return json({ error: 'reconnect' }, 401);
    if (e.status === 429) return json({ error: 'busy' }, 429);
    return json({ error: 'unreachable' }, 502);
  }
}
