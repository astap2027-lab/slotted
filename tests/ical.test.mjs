import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, eventsBetween, fromZone, inZone, cleanZone, calendarUrl } from '../js/ical.js';

const TZ = 'Australia/Sydney';
// Week of Monday 16 Nov 2026 (Sydney is UTC+11 in November).
const FROM = fromZone({ y: 2026, mo: 11, d: 16, h: 0, mi: 0 }, TZ);
const TO = fromZone({ y: 2026, mo: 11, d: 23, h: 0, mi: 0 }, TZ);
const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:My calendar', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];

test('time zones: Sydney wall time to instant and back, including daylight saving', () => {
  const t = fromZone({ y: 2026, mo: 11, d: 16, h: 9, mi: 40 }, TZ);
  assert.equal(new Date(t).toISOString(), '2026-11-15T22:40:00.000Z', 'UTC+11 in summer');
  const w = fromZone({ y: 2026, mo: 6, d: 15, h: 9, mi: 40 }, TZ);
  assert.equal(new Date(w).toISOString(), '2026-06-14T23:40:00.000Z', 'UTC+10 in winter');
  assert.deepEqual(inZone(t, TZ), { y: 2026, mo: 11, d: 16, h: 9, mi: 40, s: 0 });
  assert.equal(cleanZone('AUS Eastern Standard Time'), 'Australia/Sydney');
  assert.equal(cleanZone('/mozilla.org/20050126_1/Australia/Sydney'), 'Australia/Sydney');
  assert.equal(cleanZone('Not/AZone'), null);
  assert.equal(calendarUrl(' webcal://p01-caldav.icloud.com/published/2/abc '), 'https://p01-caldav.icloud.com/published/2/abc');
});

test('Google style: UTC times, folded lines and escaped text', () => {
  const text = cal(ev(['UID:g1@google.com', 'DTSTART:20261116T053000Z', 'DTEND:20261116T070000Z',
    'SUMMARY:O Group\\, then', ' meeting', 'LOCATION:Room 4\; Block B']));
  const [e] = eventsBetween(text, FROM, TO, { tz: TZ });
  assert.equal(e.title, 'O Group, thenmeeting');
  assert.equal(e.location, 'Room 4; Block B');
  assert.equal(e.date, '2026-11-16'); assert.equal(e.startTime, '16:30'); assert.equal(e.endTime, '18:00');
  assert.equal(parseICS(text).name, 'My calendar');
});

test('Apple style: TZID times and a weekly repeat on two days until a date, with one day skipped', () => {
  const text = cal(ev(['UID:a1', 'DTSTART;TZID=Australia/Sydney:20261103T160000', 'DTEND;TZID=Australia/Sydney:20261103T180000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T000000Z', 'EXDATE;TZID=Australia/Sydney:20261119T160000', 'SUMMARY:Sailing']));
  const list = eventsBetween(text, FROM, TO, { tz: TZ });
  assert.deepEqual(list.map((e) => `${e.date} ${e.startTime}-${e.endTime}`), ['2026-11-17 16:00-18:00'], 'Thursday the 19th is skipped');
});

test('repeats keep their wall-clock time across a daylight saving change', () => {
  const text = cal(ev(['UID:d1', 'DTSTART;TZID=Australia/Sydney:20260930T070000', 'DTEND;TZID=Australia/Sydney:20260930T080000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Swim squad']));
  const oct = fromZone({ y: 2026, mo: 10, d: 5, h: 0, mi: 0 }, TZ); // daylight saving starts 4 Oct 2026
  const [e] = eventsBetween(text, oct, oct + 7 * 86400000, { tz: TZ });
  assert.equal(e.startTime, '07:00');
});

test('school app style: one event per class; counts, durations and all-day events', () => {
  const text = cal(
    ev(['UID:s1', 'DTSTART;TZID=Australia/Sydney:20261116T094000', 'DURATION:PT55M', 'SUMMARY:Mathematics Standard']),
    ev(['UID:s2', 'DTSTART;TZID=Australia/Sydney:20261116T142500', 'DTEND;TZID=Australia/Sydney:20261116T151500', 'SUMMARY:Legal Studies']),
    ev(['UID:h1', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122', 'SUMMARY:Camp']),
    ev(['UID:c1', 'DTSTART;TZID=Australia/Sydney:20261102T080000', 'DTEND;TZID=Australia/Sydney:20261102T083000', 'RRULE:FREQ=DAILY;COUNT=5', 'SUMMARY:Ends before this week']),
  );
  const list = eventsBetween(text, FROM, TO, { tz: TZ });
  assert.deepEqual(list.map((e) => e.title), ['Mathematics Standard', 'Legal Studies', 'Camp']);
  assert.equal(list[0].endTime, '10:35');
  assert.equal(list[2].allDay, true); assert.deepEqual(list[2].days, ['2026-11-20', '2026-11-21']);
});

test('a moved single occurrence replaces the original; cancelled and "free" events are marked', () => {
  const text = cal(
    ev(['UID:r1', 'DTSTART;TZID=Australia/Sydney:20261102T160000', 'DTEND;TZID=Australia/Sydney:20261102T170000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Training']),
    ev(['UID:r1', 'RECURRENCE-ID;TZID=Australia/Sydney:20261116T160000', 'DTSTART;TZID=Australia/Sydney:20261116T170000', 'DTEND;TZID=Australia/Sydney:20261116T180000', 'SUMMARY:Training (late)']),
    ev(['UID:x1', 'DTSTART:20261117T050000Z', 'DTEND:20261117T060000Z', 'STATUS:CANCELLED', 'SUMMARY:Called off']),
    ev(['UID:f1', 'DTSTART:20261118T050000Z', 'DTEND:20261118T060000Z', 'TRANSP:TRANSPARENT', 'SUMMARY:Maybe']),
    ev(['UID:al', 'DTSTART:20261119T050000Z', 'DTEND:20261119T060000Z', 'SUMMARY:With alarm', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT15M', 'END:VALARM']),
  );
  const list = eventsBetween(text, FROM, TO, { tz: TZ });
  assert.deepEqual(list.map((e) => `${e.title} ${e.date} ${e.startTime}`), ['Training (late) 2026-11-16 17:00', 'Maybe 2026-11-18 16:00', 'With alarm 2026-11-19 16:00']);
  assert.equal(list[1].free, true);
});

test('broken or empty text gives no events instead of an error', () => {
  assert.deepEqual(eventsBetween('', FROM, TO, { tz: TZ }), []);
  assert.deepEqual(eventsBetween('<html>not a calendar</html>', FROM, TO, { tz: TZ }), []);
  assert.deepEqual(eventsBetween(cal(ev(['UID:b', 'DTSTART:garbage', 'SUMMARY:x'])), FROM, TO, { tz: TZ }), []);
});
