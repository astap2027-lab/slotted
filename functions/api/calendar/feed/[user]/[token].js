// Cloudflare Pages Function: GET /api/calendar/feed/<user id>/<token>.ics
// A calendar of this person's planned gym sessions, for Google, Apple or Outlook to subscribe to. The sessions are
// worked out by the app (state.calendarExport) and saved with their synced data; this only writes them out.
// The token is random and lives in their data (state.calendarFeed); a new link or turning it off stops the old one.
import { buildICS } from '../../../../../js/ical.js';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

// Compare without leaking how much matched.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ params, env }) {
  if (!env.DB) return new Response('Not available', { status: 503 });
  const user = String(params.user || '');
  const token = String(params.token || '').replace(/\.ics$/i, '');
  if (!/^[\w-]{1,80}$/.test(user) || !/^[\w-]{16,100}$/.test(token)) return notFound();
  const row = await env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(user).first();
  if (!row) return notFound();
  let data;
  try { data = JSON.parse(row.data); } catch { return notFound(); }
  if (!data || !data.calendarFeed || !same(data.calendarFeed.token, token)) return notFound();
  const exp = data.calendarExport || {};
  return new Response(buildICS(exp.events || [], { stamp: exp.at || Date.now() }), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'content-disposition': 'inline; filename="slotted.ics"' },
  });
}
