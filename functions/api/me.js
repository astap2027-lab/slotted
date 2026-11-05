// GET /api/me: who is signed in, and what's connected.
import { json, currentUser } from '../../server/lib.js';

export async function onRequestGet({ request, env }) {
  const available = !!(env.GOOGLE_CLIENT_ID && env.DB);
  const user = await currentUser(request, env);
  if (!user) return json({ signedIn: false, available }, 200);
  const strava = await env.DB.prepare('SELECT athlete_name FROM strava WHERE user_id = ?').bind(user.id).first();
  return json({
    signedIn: true,
    available,
    user: { name: user.name, email: user.email },
    strava: { available: !!env.STRAVA_CLIENT_ID, connected: !!strava, athlete: strava ? strava.athlete_name : null },
  });
}
