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

// ---------- a real school feed: class codes and teachers, study periods, cancelled classes ----------
import { looksLikeSchool, classLike } from '../js/timetable.js';
const day = (d) => `202611${String(16 + d).padStart(2, '0')}`;
const P = [['0845', '0940'], ['0940', '0955'], ['0955', '1050'], ['1120', '1215'], ['1215', '1305'], ['1335', '1425'], ['1425', '1515']];
const axelWeek = cal(
  ev('m1', `${day(0)}T`.slice(0, 8) + 'T084500', `${day(0)}T094000`, '11Study.b!MonB1'),
  ev('m2', `${day(0)}T094000`, `${day(0)}T095500`, 'TE05. Charlesworth, Harry'),
  ev('m3', `${day(0)}T095500`, `${day(0)}T105000`, '12ENA.04 Charlesworth, Harry'),
  ev('m4', `${day(0)}T112000`, `${day(0)}T121500`, '11Study.c!MonB3 TBA'),
  ev('m5', `${day(0)}T121500`, `${day(0)}T130500`, '12HMS.04 Darvill, Patrick'),
  ev('m6', `${day(0)}T133500`, `${day(0)}T142500`, '12MAG.06 Soden, Mr C'),
  ev('m7', `${day(0)}T142500`, `${day(0)}T151500`, '12SR2.01 Lawson, Angus'),
  ev('og', `${day(0)}T153000`, `${day(0)}T163000`, 'O Group'),
  ...[1, 2, 3, 4].flatMap((d) => P.map(([s, e], i) => ev(`c${d}${i}`, `${day(d)}T${s}00`, `${day(d)}T${e}00`, i === 1 && d === 3 ? 'TE05. Cancelled Charlesworth, Harry' : `12LG2.0${i} Tatton, Jonathan`))),
  ev('cad', `${day(4)}T151500`, `${day(4)}T180000`, 'Cadets'),
  ev('sw', `${day(2)}T130500`, `${day(2)}T133500`, 'SOTWEG in W33'),
);

test('a real school feed reads as one School block a day; study, cancelled and after-school events handled', () => {
  const evs = events(axelWeek);
  assert.equal(looksLikeSchool(evs), true, '"Work it out" spots a school timetable');
  assert.equal(looksLikeSchool(events(personal)), false, 'a personal calendar is not a school timetable');
  assert.equal(classLike(evs.find((e) => e.title === 'Cadets')), false);
  const blocks = calendarBlocks(evs, { id: 's', name: 'Compass', type: 'auto' }, {}, KEY);
  const rows = blocks.map((b) => `${b.day} ${b.start}-${b.end} ${b.type} ${b.label}${b.merged ? ` (${b.classes})` : ''}`);
  assert.deepEqual(rows, [
    '0 09:40-15:15 school School (5)', // Monday starts at roll call: period 1 is a study period
    '0 15:30-16:30 other O Group',
    '1 08:45-15:15 school School (7)',
    '2 08:45-15:15 school School (8)', // SOTWEG at lunch is class-like, inside the day
    '3 08:45-15:15 school School (6)', // the cancelled roll call is skipped
    '4 08:45-15:15 school School (7)',
    '4 15:15-18:00 other Cadets',
  ]);
  // The same calendar marked "School timetable" gives the same result.
  assert.deepEqual(calendarBlocks(evs, { id: 's', name: 'Compass', type: 'school' }, {}, KEY).map((b) => b.label), blocks.map((b) => b.label));
});

test('a lone class-like event on a school calendar stays as itself, not a one-class School day', () => {
  const evs = events(axelWeek);
  const wedOnly = evs.filter((e) => e.date !== '2026-11-18' || e.title === 'SOTWEG in W33');
  const blocks = calendarBlocks(wedOnly, { id: 's', name: 'Compass', type: 'auto' }, {}, KEY);
  assert.deepEqual(blocks.filter((b) => b.day === 2).map((b) => `${b.start}-${b.end} ${b.label}${b.merged ? ' merged' : ''}`), ['13:05-13:35 SOTWEG in W33']);
  assert.ok(blocks.filter((b) => b.day === 1).every((b) => b.merged), 'days with real classes still merge');
});
