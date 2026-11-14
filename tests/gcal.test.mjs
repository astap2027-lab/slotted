import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockEvents, sessionEvents, eventsBetween, fromZone } from '../js/ical.js';
import { calendarBlocks } from '../js/timetable.js';
import { syncEvents, GCAL_SCOPE } from '../server/gcal.js';
import { cleanEvents, onRequestPost as syncPost } from '../functions/api/calendar/google/sync.js';
import { onRequestGet as startGet } from '../functions/api/calendar/google/start.js';

const TZ = 'Australia/Sydney';

test('commitments added in Slotted become dated events with stable ids', () => {
  const ev = blockEvents([{ key: '2026-11-16', blocks: [{ id: 'sail', day: 1, start: '16:00', end: '18:00', label: 'Sailing', type: 'sport' }] }], { tz: TZ });
  assert.deepEqual(ev, [{ uid: '2026-11-16-c-sail@slotted', title: 'Sailing', start: '2026-11-17T05:00:00.000Z', end: '2026-11-17T07:00:00.000Z', notes: 'Sport you added in Slotted.' }]);
});

test('events Slotted wrote into Google are never read back in as commitments', () => {
  const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:abc@google.com', 'DTSTART:20261117T050000Z', 'DTEND:20261117T070000Z', 'SUMMARY:Gym: Legs', 'DESCRIPTION:Squat 3×5\\n\\nAdded by Slotted', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const from = fromZone({ y: 2026, mo: 11, d: 16, h: 0, mi: 0 }, TZ);
  const evs = eventsBetween(text, from, from + 7 * 86400000, { tz: TZ });
  assert.match(evs[0].notes, /Added by Slotted/);
  assert.deepEqual(calendarBlocks(evs, { id: 'g', name: 'Google', type: 'auto' }, {}, '2026-11-16'), []);
});

test('only well-formed events are sent on', () => {
  const out = cleanEvents([{ uid: 'a', title: 'Gym', start: '2026-11-17T05:00:00Z', end: '2026-11-17T06:00:00Z' }, { uid: 'b', start: 'x', end: 'y' }, { uid: 'c', start: '2026-11-17T06:00:00Z', end: '2026-11-17T05:00:00Z' }, null]);
  assert.deepEqual(out.map((e) => e.uid), ['a']);
});

// A stand-in Google Calendar API.
function fakeGoogle(initial = []) {
  const events = new Map(initial.map((e, i) => [`g${i}`, e]));
  let n = 100;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname.replace(/^\/calendar\/v3/, '')}`);
    const id = u.pathname.split('/events/')[1];
    if (method === 'GET' && u.pathname.endsWith('/events')) {
      assert.equal(u.searchParams.get('privateExtendedProperty'), 'slotted=1', 'only Slotted events are listed');
      return new Response(JSON.stringify({ items: [...events.entries()].map(([gid, e]) => ({ id: gid, ...e })) }));
    }
    if (method === 'POST') { events.set(`g${n++}`, JSON.parse(init.body)); return new Response('{}'); }
    if (method === 'PATCH') { events.set(id, JSON.parse(init.body)); return new Response('{}'); }
    if (method === 'DELETE') { events.delete(id); return new Response(null, { status: 204 }); }
    return new Response('{}', { status: 404 });
  };
  return { events, calls };
}

test('the Slotted calendar is made to match: add, change, remove, and leave matching ones alone', async () => {
  const want = sessionEvents([{ key: '2026-11-16', sessions: [
    { key: 'legs', name: 'Legs', day: 0, start: 420, end: 480, exercises: ['Squat 3×5'] },
    { key: 'push', name: 'Push', day: 2, start: 930, end: 990, exercises: [] },
  ] }], { tz: TZ });
  const body = (e) => ({ summary: e.title, description: `${e.notes}\n\nAdded by Slotted`, start: { dateTime: e.start }, end: { dateTime: e.end }, extendedProperties: { private: { slotted: '1', slottedId: e.uid } } });
  const g = fakeGoogle([
    body(want[0]), // already right
    { ...body(want[1]), start: { dateTime: '2026-11-18T03:00:00.000Z' } }, // moved
    { summary: 'Gym: Old', start: { dateTime: '2026-11-19T05:00:00Z' }, end: { dateTime: '2026-11-19T06:00:00Z' }, extendedProperties: { private: { slotted: '1', slottedId: 'gone@slotted' } } },
  ]);
  const counts = await syncEvents({ token: 't' }, 'cal1', [...want, ...blockEvents([{ key: '2026-11-16', blocks: [{ id: 's', day: 1, start: '16:00', end: '18:00', label: 'Sailing', type: 'sport' }] }], { tz: TZ })], '2026-11-15T13:00:00Z', '2026-11-29T13:00:00Z');
  assert.deepEqual(counts, { added: 1, updated: 1, removed: 1 });
  assert.equal(g.events.size, 3);
  assert.ok([...g.events.values()].every((e) => e.extendedProperties.private.slotted === '1'));
  // Running it again changes nothing.
  g.calls.length = 0;
  const again = await syncEvents({ token: 't' }, 'cal1', [...g.events.values()].map((e) => ({ uid: e.extendedProperties.private.slottedId, title: e.summary, start: e.start.dateTime, end: e.end.dateTime, notes: e.description.replace(/\n\nAdded by Slotted$/, '') })), '2026-11-15T13:00:00Z', '2026-11-29T13:00:00Z');
  assert.deepEqual(again, { added: 0, updated: 0, removed: 0 });
  assert.deepEqual(g.calls, ['GET /calendars/cal1/events']);
});

test('connecting asks only for the narrow "calendars Slotted makes" permission; signed out goes to sign in', async () => {
  assert.equal(GCAL_SCOPE, 'https://www.googleapis.com/auth/calendar.app.created');
  const req = new Request('https://slotted-ea5.pages.dev/api/calendar/google/start');
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', TOKEN_KEY: 'k', DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  const r = await startGet({ request: req, env });
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /gcal=signin/);
  assert.equal((await startGet({ request: req, env: {} })).status, 503);
});

test('the sync endpoint refuses other sites, signed-out people and bad windows', async () => {
  const req = (body, headers = {}) => new Request('https://slotted-ea5.pages.dev/api/calendar/google/sync', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  assert.equal((await syncPost({ request: req({}, { Origin: 'https://evil.example' }), env })).status, 403);
  assert.equal((await syncPost({ request: req({ from: '2026-11-16T00:00:00Z', to: '2026-11-30T00:00:00Z' }), env })).status, 401);
});
