import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionEvents, buildICS, eventsBetween, fromZone } from '../js/ical.js';
import { calendarBlocks } from '../js/timetable.js';
import { onRequestGet } from '../functions/api/calendar/feed/[user]/[token].js';

const TZ = 'Australia/Sydney';
const weeks = [
  { key: '2026-11-09', sessions: [{ key: 'upperA', name: 'Upper A', day: 3, start: 420, end: 480, short: false, exercises: ['Bench press 3×6–8', 'Row 3×8–10'] }] },
  { key: '2026-11-16', sessions: [{ key: 'lowerA', name: 'Legs; heavy, day', day: 0, start: 930, end: 960, short: true, exercises: [] }] },
];

test('planned sessions become calendar events at the right times, with stable ids', () => {
  const ev = sessionEvents(weeks, { tz: TZ });
  assert.equal(ev.length, 2);
  assert.equal(ev[0].uid, '2026-11-09-upperA@slotted');
  assert.equal(ev[0].start, '2026-11-11T20:00:00.000Z', 'Thursday 7am in Sydney (UTC+11)');
  assert.equal(ev[0].end, '2026-11-11T21:00:00.000Z');
  assert.equal(ev[0].title, 'Gym: Upper A');
  assert.match(ev[0].notes, /Bench press 3×6–8\nRow 3×8–10/);
  assert.equal(ev[1].title, 'Gym: Legs; heavy, day (short)');
  assert.equal(ev[1].start, '2026-11-16T04:30:00.000Z');
});

test('the calendar file is valid: CRLF, folded long lines, escaped text, and it reads back the same', () => {
  const ev = sessionEvents(weeks, { tz: TZ });
  const text = buildICS(ev, { stamp: Date.UTC(2026, 10, 12) });
  assert.match(text, /^BEGIN:VCALENDAR\r\n/); assert.match(text, /END:VCALENDAR\r\n$/);
  assert.ok(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'no line over 75 bytes');
  assert.ok(text.includes('SUMMARY:Gym: Legs\\; heavy\\, day (short)'), 'semicolons and commas are escaped');
  assert.match(text, /DTSTART:20261111T200000Z/);
  // Reading it back gives the same sessions, in Sydney time.
  const from = fromZone({ y: 2026, mo: 11, d: 9, h: 0, mi: 0 }, TZ);
  const back = eventsBetween(text, from, from + 14 * 86400000, { tz: TZ });
  assert.deepEqual(back.map((e) => `${e.date} ${e.startTime}-${e.endTime} ${e.title}`), ['2026-11-12 07:00-08:00 Gym: Upper A', '2026-11-16 15:30-16:00 Gym: Legs; heavy, day (short)']);
  assert.match(back[0].title + back[0].uid, /@slotted$/);
  // If someone connects Slotted's own feed as a calendar, the sessions are not read back in as commitments.
  assert.deepEqual(calendarBlocks(back, { id: 'x', name: 'Slotted', type: 'auto' }, {}, '2026-11-09'), []);
  assert.doesNotMatch(buildICS([{ uid: 'bad', start: 'nope', end: 'nope', title: 'x' }]), /BEGIN:VEVENT/, 'broken events are left out');
});

// A tiny stand-in for the D1 database.
const db = (rows) => ({ prepare: () => ({ bind: (id) => ({ first: async () => (rows[id] ? { data: JSON.stringify(rows[id]) } : null) }) }) });
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const data = { calendarFeed: { token: TOKEN }, calendarExport: { at: Date.UTC(2026, 10, 12), events: sessionEvents(weeks, { tz: TZ }) } };

test('the feed gives the calendar only for the right token', async () => {
  const env = { DB: db({ u1: data, u2: { calendarExport: data.calendarExport } }) };
  const ok = await onRequestGet({ params: { user: 'u1', token: `${TOKEN}.ics` }, env });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/calendar/);
  const text = await ok.text();
  assert.match(text, /SUMMARY:Gym: Upper A/); assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2);
  for (const [user, token] of [['u1', 'wrongwrongwrongwrongwrongwrong12'], ['u1', TOKEN.slice(0, -1)], ['u2', TOKEN], ['nobody', TOKEN], ['u1', 'short'], ['../x', TOKEN]]) {
    assert.equal((await onRequestGet({ params: { user, token }, env })).status, 404, `${user}/${token}`);
  }
  assert.equal((await onRequestGet({ params: { user: 'u1', token: TOKEN }, env: {} })).status, 503);
  const empty = await onRequestGet({ params: { user: 'u3', token: TOKEN }, env: { DB: db({ u3: { calendarFeed: { token: TOKEN } } }) } });
  assert.equal(empty.status, 200); assert.doesNotMatch(await empty.text(), /BEGIN:VEVENT/, 'turned on but nothing synced yet: an empty calendar');
});
