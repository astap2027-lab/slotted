// Talking to Strava. Activities are fetched live for the person viewing them and never stored,
// and Strava data is never sent to the AI coach (Strava's API terms forbid using it in AI).
import { encrypt, decrypt } from './lib.js';

export const STRAVA_SCOPE = 'activity:read_all';

export async function stravaToken(env, fields) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...fields }),
  });
  if (!res.ok) throw new Error(`strava_token_${res.status}`);
  return res.json();
}

export async function saveTokens(env, userId, t, athlete) {
  const access = await encrypt(env, t.access_token);
  const refresh = await encrypt(env, t.refresh_token);
  if (athlete) {
    const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || 'Strava athlete';
    await env.DB.prepare(
      `INSERT INTO strava (user_id, athlete_id, athlete_name, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET athlete_id = excluded.athlete_id, athlete_name = excluded.athlete_name,
       access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`,
    ).bind(userId, String(athlete.id), name, access, refresh, t.expires_at).run();
  } else {
    await env.DB.prepare('UPDATE strava SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?')
      .bind(access, refresh, t.expires_at, userId).run();
  }
}

// A valid access token, refreshing it first if it expires within a minute.
export async function accessTokenFor(env, userId) {
  const row = await env.DB.prepare('SELECT access_token, refresh_token, expires_at FROM strava WHERE user_id = ?').bind(userId).first();
  if (!row) return null;
  if (row.expires_at > Date.now() / 1000 + 60) return decrypt(env, row.access_token);
  const t = await stravaToken(env, { grant_type: 'refresh_token', refresh_token: await decrypt(env, row.refresh_token) });
  await saveTokens(env, userId, t);
  return t.access_token;
}

export async function revoke(env, token) {
  try {
    await fetch('https://www.strava.com/oauth/revoke', {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.STRAVA_CLIENT_ID}:${env.STRAVA_CLIENT_SECRET}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }),
    });
  } catch { /* the local record is removed regardless */ }
}

const RACE_TYPES = new Set([1, 11]); // run race, ride race

// Strava's local start time is written like UTC ("...Z") but is the athlete's local clock time.
export function simplify(a) {
  const [date, time] = String(a.start_date_local || '').replace('Z', '').split('T');
  return {
    id: String(a.id),
    name: a.name || a.sport_type || 'Activity',
    type: a.sport_type || a.type || 'Workout',
    date,
    start: time ? time.slice(0, 5) : '12:00',
    minutes: Math.max(1, Math.round((a.moving_time || a.elapsed_time || 0) / 60)),
    km: a.distance ? Math.round(a.distance / 100) / 10 : null,
    hard: RACE_TYPES.has(a.workout_type) || (a.suffer_score || 0) >= 100,
  };
}
