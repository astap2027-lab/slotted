// GET /api/me: who is signed in, and what's connected.
import { json, currentUser } from '../../server/lib.js';

export async function onRequestGet({ request, env }) {
  const available = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB);
  const user = await currentUser(request, env);
  if (!user) return json({ signedIn: false, available }, 200);
  const strava = await env.DB.prepare('SELECT athlete_name FROM strava WHERE user_id = ?').bind(user.id).first();
  // Google Calendar writing needs the google_calendar table (schema.sql) and TOKEN_KEY; until then it's not offered.
  let gcal = { available: false, connected: false };
  if (env.TOKEN_KEY) {
    try {
      const row = await env.DB.prepare('SELECT connected_at FROM google_calendar WHERE user_id = ?').bind(user.id).first();
      gcal = { available: true, connected: !!row };
    } catch { gcal = { available: false, connected: false, needsSetup: true }; }
  }
  return json({
    signedIn: true,
    available,
    user: { id: user.id, name: user.name, email: user.email },
    strava: { available: !!env.STRAVA_CLIENT_ID, connected: !!strava, athlete: strava ? strava.athlete_name : null },
    gcal,
  });
}
