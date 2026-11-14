// Writing to the person's Google Calendar. Slotted gets the narrow "calendar.app.created" permission: it can make
// its own calendar ("Slotted") and add, change and delete events in it, and nothing else in their Google account.
// Tokens are encrypted with TOKEN_KEY before they're stored (table google_calendar).
import { encrypt, decrypt } from './lib.js';

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
export const GCAL_MARK = 'Added by Slotted';

export async function googleToken(env, fields) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...fields }),
  });
  if (!res.ok) { const e = new Error(`google_token_${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

export async function saveConnection(env, userId, t) {
  const refresh = t.refresh_token ? await encrypt(env, t.refresh_token) : null;
  const access = await encrypt(env, t.access_token);
  const expires = Math.floor(Date.now() / 1000) + (Number(t.expires_in) || 3000);
  if (refresh) {
    await env.DB.prepare(
      `INSERT INTO google_calendar (user_id, refresh_token, access_token, expires_at, connected_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token, access_token = excluded.access_token, expires_at = excluded.expires_at`,
    ).bind(userId, refresh, access, expires, Date.now()).run();
  } else {
    await env.DB.prepare('UPDATE google_calendar SET access_token = ?, expires_at = ? WHERE user_id = ?').bind(access, expires, userId).run();
  }
}

// The stored connection with a valid access token (refreshed when it's about to run out), or null.
export async function connection(env, userId) {
  const row = await env.DB.prepare('SELECT refresh_token, access_token, expires_at, calendar_id FROM google_calendar WHERE user_id = ?').bind(userId).first();
  if (!row) return null;
  if (row.access_token && row.expires_at > Date.now() / 1000 + 60) return { token: await decrypt(env, row.access_token), calendarId: row.calendar_id };
  const t = await googleToken(env, { grant_type: 'refresh_token', refresh_token: await decrypt(env, row.refresh_token) });
  await saveConnection(env, userId, t);
  return { token: t.access_token, calendarId: row.calendar_id };
}

async function gapi(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(`gcal_${res.status}`); e.status = res.status; throw e; }
  return data;
}

// Slotted's own calendar in their account, made the first time (or again if they deleted it).
export async function ensureCalendar(env, userId, conn, timeZone) {
  if (conn.calendarId) {
    try { await gapi(conn.token, `/calendars/${encodeURIComponent(conn.calendarId)}`); return conn.calendarId; } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
  }
  const cal = await gapi(conn.token, '/calendars', { method: 'POST', body: { summary: 'Slotted', description: 'Gym sessions and commitments from Slotted. Change them in Slotted; this calendar follows.', timeZone: timeZone || 'Australia/Sydney' } });
  await env.DB.prepare('UPDATE google_calendar SET calendar_id = ? WHERE user_id = ?').bind(cal.id, userId).run();
  return cal.id;
}

const eventBody = (e) => ({
  summary: e.title,
  description: `${e.notes ? `${e.notes}\n\n` : ''}${GCAL_MARK}`,
  start: { dateTime: e.start },
  end: { dateTime: e.end },
  transparency: 'opaque',
  extendedProperties: { private: { slotted: '1', slottedId: e.uid } },
  reminders: { useDefault: false },
});
const same = (g, e) => g.summary === e.title && Date.parse(g.start && g.start.dateTime) === Date.parse(e.start)
  && Date.parse(g.end && g.end.dateTime) === Date.parse(e.end) && (g.description || '') === eventBody(e).description;

/**
 * Make Slotted's calendar match `events` between `from` and `to` (ISO): add what's missing, update what changed,
 * delete Slotted events in that window that are no longer wanted. Events outside the window are left alone.
 */
export async function syncEvents(conn, calendarId, events, from, to) {
  const have = new Map();
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', maxResults: '250', privateExtendedProperty: 'slotted=1', ...(pageToken ? { pageToken } : {}) });
    const page = await gapi(conn.token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    for (const g of page.items || []) {
      const id = g.extendedProperties && g.extendedProperties.private && g.extendedProperties.private.slottedId;
      if (id) { if (have.has(id)) await gapi(conn.token, `/calendars/${encodeURIComponent(calendarId)}/events/${g.id}`, { method: 'DELETE' }); else have.set(id, g); }
    }
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  const counts = { added: 0, updated: 0, removed: 0 };
  const cal = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for (const e of events) {
    const g = have.get(e.uid);
    have.delete(e.uid);
    if (!g) { await gapi(conn.token, cal, { method: 'POST', body: eventBody(e) }); counts.added++; } else if (!same(g, e)) { await gapi(conn.token, `${cal}/${g.id}`, { method: 'PATCH', body: eventBody(e) }); counts.updated++; }
  }
  for (const g of have.values()) { await gapi(conn.token, `${cal}/${g.id}`, { method: 'DELETE' }); counts.removed++; }
  return counts;
}

export async function revokeGoogle(token) {
  try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }); } catch { /* best effort */ }
}
