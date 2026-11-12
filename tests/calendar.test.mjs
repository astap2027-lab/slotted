import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsBetween, fromZone } from '../js/ical.js';
import { calendarBlocks, calendarDiff, weekBlocks, guessType, guessEffort, ruleKey } from '../js/timetable.js';
import { mergeStates } from '../js/sync.js';
import { onRequestPost, checkUrl } from '../functions/api/calendar/fetch.js';

const TZ = 'Australia/Sydney';
const KEY = '2026-11-16';
const FROM = fromZone({ y: 2026, mo: 11, d: 16, h: 0, mi: 0 }, TZ);
const TO = FROM + 7 * 86400000;
const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = (uid, start, end, summary, extra = []) => ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART;TZID=Australia/Sydney:${start}`, `DTEND;TZID=Australia/Sydney:${end}`, `SUMMARY:${summary}`, ...extra, 'END:VEVENT'];

const personal = cal(
  ev('p1', '20261117T160000', '20261117T180000', 'Sailing'),
  ev('p2', '20261121T090000', '20261121T120000', 'Sailing regatta'),
  ev('p3', '20261118T153000', '20261118T170000', 'O Group'),
  ev('p4', '20261120T160000', '20261120T190000', 'Work shift at Coles'),
  ev('p5', '20261119T100000', '20261119T110000', 'Dentist'),
  ev('p6', '20261119T120000', '20261119T130000', 'Maybe lunch', ['TRANSP:TRANSPARENT']),
  ['BEGIN:VEVENT', 'UID:p7', 'DTSTART;VALUE=DATE:20261122', 'DTEND;VALUE=DATE:20261123', 'SUMMARY:Grandma’s birthday', 'END:VEVENT'],
);
const school = cal(
  ev('s1', '20261116T094000', '20261116T105000', 'Study'),
  ev('s2', '20261116T105000', '20261116T120000', 'Mathematics Standard'),
  ev('s3', '20261116T142500', '20261116T151500', 'Legal Studies'),
  ev('s4', '20261117T084500', '20261117T094000', 'English Advanced'),
  ev('s5', '20261117T120000', '20261117T130500', 'Health & Movement Science'),
);
const events = (text) => eventsBetween(text, FROM, TO, { tz: TZ });

test('event names say what kind of commitment it is', () => {
  assert.equal(guessType('Sailing'), 'sport'); assert.equal(guessType('Rugby game'), 'sport');
  assert.equal(guessType('Work shift at Coles'), 'work'); assert.equal(guessType('Maths class'), 'school');
  assert.equal(guessType('Dentist'), 'other');
  assert.equal(guessEffort('Sailing regatta'), 'hard'); assert.equal(guessEffort('Recovery swim'), 'easy'); assert.equal(guessEffort('Sailing'), 'light');
});

test('a personal calendar: sport with effort, work, other; "free" events skipped; all-day ignored unless asked', () => {
  const blocks = calendarBlocks(events(personal), { id: 'g', name: 'Google', type: 'auto' }, {}, KEY);
  assert.deepEqual(blocks.map((b) => `${b.day} ${b.start}-${b.end} ${b.type}${b.intensity ? `/${b.intensity}` : ''} ${b.label}`), [
    '1 16:00-18:00 sport/light Sailing',
    '2 15:30-17:00 other O Group',
    '3 10:00-11:00 other Dentist',
    '4 16:00-19:00 work Work shift at Coles',
    '5 09:00-12:00 sport/hard Sailing regatta',
  ]);
  assert.ok(blocks.every((b) => b.calId === 'g' && b.id.startsWith('cal:g:')));
  const allDay = calendarBlocks(events(personal), { id: 'g', name: 'Google', type: 'auto', allDayBlocks: true }, {}, KEY);
  assert.ok(allDay.some((b) => b.day === 6 && b.start === '00:00' && b.end === '23:59'));
});

test('your rules win: type, effort, flexible and ignore, matched by event name', () => {
  const rules = { [ruleKey('Sailing')]: { type: 'sport', intensity: 'easy', flex: true }, [ruleKey('dentist')]: { ignore: true }, [ruleKey('O Group')]: { type: 'school' } };
  const blocks = calendarBlocks(events(personal), { id: 'g', name: 'Google', type: 'auto' }, rules, KEY);
  const sail = blocks.find((b) => b.label === 'Sailing');
  assert.equal(sail.intensity, 'easy'); assert.equal(sail.flex, true);
  assert.ok(!blocks.some((b) => b.label === 'Dentist'));
  assert.equal(blocks.find((b) => b.label === 'O Group').type, 'school');
});

test('a school calendar becomes one School block a day, first real class to last; study periods skipped', () => {
  const blocks = calendarBlocks(events(school), { id: 's', name: 'Compass', type: 'school' }, {}, KEY);
  assert.deepEqual(blocks.map((b) => `${b.day} ${b.start}-${b.end} ${b.label} ${b.classes}`), ['0 10:50-15:15 School 2', '1 08:45-13:05 School 2']);
});

test('the week’s commitments: calendar school replaces the timetable’s school on those days only', () => {
  const st = {
    useAB: false, blocks: { A: [0, 1, 2].map((d) => ({ id: `t${d}`, day: d, start: '08:45', end: '15:15', type: 'school', label: 'School' })), B: [] },
    history: { [KEY]: { cal: calendarBlocks(events(school), { id: 's', name: 'Compass', type: 'school' }, {}, KEY) } },
  };
  const wk = weekBlocks(st, KEY);
  const sch = (d) => wk.filter((b) => b.day === d && b.type === 'school').map((b) => `${b.start}-${b.end}${b.cal ? ' cal' : ''}`);
  assert.deepEqual(sch(0), ['10:50-15:15 cal']); assert.deepEqual(sch(1), ['08:45-13:05 cal']);
  assert.deepEqual(sch(2), ['08:45-15:15'], 'Wednesday has no calendar classes, so the timetable stays');
  assert.deepEqual(weekBlocks({ ...st, history: {} }, KEY).length, 3, 'old data without calendars is unchanged');
});

test('what changed, in plain words', () => {
  const before = [{ calId: 'g', label: 'Sailing', day: 1, start: '16:00', end: '18:00' }, { calId: 'g', label: 'Dentist', day: 3, start: '10:00', end: '11:00' }];
  const after = [{ calId: 'g', label: 'Sailing', day: 1, start: '16:30', end: '18:30' }, { calId: 'g', label: 'Cadets', day: 4, start: '15:15', end: '18:00' }];
  assert.deepEqual(calendarDiff(before, after), ['Moved: Sailing, now Tuesday 4:30pm to 6:30pm', 'Added: Cadets, Friday 3:15pm to 6pm', 'Removed: Dentist, Thursday 10am to 11am']);
  assert.deepEqual(calendarDiff(after, after), []);
});

test('two devices: calendars and imported commitments survive a sync', () => {
  const local = { updatedAt: 2, calendars: [{ id: 'g', name: 'Google', url: 'https://x.test/a.ics' }], history: { [KEY]: { done: [], cal: [{ id: 'cal:g:1' }] } } };
  const server = { updatedAt: 1, history: { [KEY]: { done: ['x'] } } };
  const out = mergeStates(local, server);
  assert.equal(out.calendars[0].id, 'g'); assert.equal(out.history[KEY].cal[0].id, 'cal:g:1');
  const out2 = mergeStates({ updatedAt: 3, history: { [KEY]: { done: [] } } }, { updatedAt: 1, history: { [KEY]: { cal: [{ id: 'keep' }] } } });
  assert.equal(out2.history[KEY].cal[0].id, 'keep');
});

// ---------- the fetch function ----------
const req = (body, headers = {}) => new Request('https://slotted-ea5.pages.dev/api/calendar/fetch', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('only public https calendar links are fetched', () => {
  assert.ok(checkUrl('https://calendar.google.com/calendar/ical/abc/private-123/basic.ics'));
  assert.equal(checkUrl('webcal://p52-caldav.icloud.com/published/2/xyz').href, 'https://p52-caldav.icloud.com/published/2/xyz');
  for (const bad of ['http://calendar.google.com/x.ics', 'https://127.0.0.1/x.ics', 'https://[::1]/x', 'https://localhost/x', 'https://printer.local/x', 'https://user:pw@example.com/x', 'https://example.com:8443/x', 'ftp://example.com/x', 'not a url', '']) {
    assert.equal(checkUrl(bad), null, bad);
  }
});

test('the fetch function returns calendars and refuses everything else', async () => {
  const send = (status, body, headers = {}) => new Response(body, { status, headers });
  globalThis.fetch = async () => send(200, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR');
  let r = await onRequestPost({ request: req({ url: 'webcal://example.com/cal.ics' }), env: {} });
  assert.equal(r.status, 200); assert.match((await r.json()).text, /^BEGIN:VCALENDAR/);
  globalThis.fetch = async () => send(200, '<html>login</html>');
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} })).status, 422);
  globalThis.fetch = async () => send(404, 'nope');
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} })).status, 404);
  globalThis.fetch = async () => send(302, '', { location: 'https://10.0.0.1/secret' });
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} })).status, 400, 'redirect to an IP is refused');
  let hops = 0;
  globalThis.fetch = async (u) => (hops++ === 0 ? send(301, '', { location: '/moved.ics' }) : send(200, `BEGIN:VCALENDAR\nX:${u}\nEND:VCALENDAR`));
  r = await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} });
  assert.match((await r.json()).text, /example\.com\/moved\.ics/, 'a redirect on the same public host is followed');
  globalThis.fetch = async () => send(200, `BEGIN:VCALENDAR\n${'x'.repeat(3000001)}`);
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} })).status, 413);
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }, { Origin: 'https://evil.example' }), env: {} })).status, 403);
  assert.equal((await onRequestPost({ request: req({ url: 'https://127.0.0.1/x' }), env: {} })).status, 400);
  globalThis.fetch = async () => { const e = new Error('slow'); e.name = 'TimeoutError'; throw e; };
  assert.equal((await onRequestPost({ request: req({ url: 'https://example.com/cal.ics' }), env: {} })).status, 502);
});
