// Cloudflare Pages Function: POST /api/calendar/fetch { url }
// Reads a calendar link (iCal) for the page, because browsers can't read other sites directly. Only https calendar
// links on public hosts are fetched, and only replies that are calendars are passed back. Nothing is stored here.
import { json, sameOrigin } from '../../../server/lib.js';

export const MAX_BYTES = 3000000;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;

// A link Slotted may fetch: https only (webcal becomes https), a public host name, no user name or password.
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host) || host.includes(':')) return null; // IP addresses
  if (/(^|\.)(localhost|local|internal|lan|home|intranet|corp)$/.test(host)) return null;
  return u;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  let url = checkUrl(body && body.url);
  if (!url) return json({ error: 'bad_url' }, 400);

  if (env.COACH_LIMITS) {
    const visitor = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `cal:${new Date().toISOString().slice(0, 10)}:${visitor}`;
    const used = Number(await env.COACH_LIMITS.get(key)) || 0;
    if (used >= (Number(env.CALENDAR_DAILY_LIMIT) || 300)) return json({ error: 'rate_limited' }, 429);
    await env.COACH_LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  }

  let res;
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(url.href, {
        redirect: 'manual',
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1', 'user-agent': 'Slotted calendar reader' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 300 || res.status >= 400) break;
      const next = checkUrl(new URL(res.headers.get('location') || '', url).href);
      if (!next || hop >= MAX_REDIRECTS) return json({ error: 'bad_url' }, 400);
      url = next;
    }
  } catch (e) {
    return json({ error: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'unreachable' }, 502);
  }
  if ([401, 403, 404, 410].includes(res.status)) return json({ error: 'not_found' }, 404);
  if (!res.ok) return json({ error: 'unreachable' }, 502);

  // Read at most MAX_BYTES.
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  let text = '';
  if (reader) {
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } return json({ error: 'too_big' }, 413); }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    text = new TextDecoder().decode(all);
  } else {
    text = await res.text();
    if (text.length > MAX_BYTES) return json({ error: 'too_big' }, 413);
  }
  if (!/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))) return json({ error: 'not_calendar' }, 422);
  return json({ text });
}
