import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planWeek, freeGaps, bestSlot, toMin, SESSIONS, weekType, weekKey, addWeeks, streakInfo,
} from '../js/scheduler.js';

const win = { start: '06:00', end: '21:00' };
const school = [0, 1, 2, 3, 4].map((day) => ({ day, start: '08:30', end: '15:10', type: 'school', label: 'School' }));
const profile = (n, extra = {}) => ({ goal: 'muscle', level: 'intermediate', equipment: 'gym', sessionsPerWeek: n, sessionLength: 60, ...extra });

const consecutiveSameGroup = (sessions) => {
  const byDay = {};
  sessions.forEach((s) => { byDay[s.day] = s.key; });
  for (let d = 0; d < 6; d++) {
    const a = byDay[d], b = byDay[d + 1];
    if (a && b && SESSIONS[a].groups.some((g) => SESSIONS[b].groups.includes(g))) return true;
  }
  return false;
};

test('free gaps respect blocks and buffers', () => {
  const gaps = freeGaps(school, 0, win);
  assert.deepEqual(gaps, [[toMin('06:00'), toMin('08:15')], [toMin('15:25'), toMin('21:00')]]);
});

test('prefers after-school slot on school days', () => {
  const slot = bestSlot(school, 0, win, 60);
  assert.equal(slot.short, false);
  assert.ok(slot.start >= toMin('15:25') && slot.start <= toMin('17:00'), `start ${slot.start}`);
});

test('3 full-body sessions are never on consecutive days', () => {
  const plan = planWeek(profile(3), school, win);
  assert.equal(plan.sessions.length, 3);
  assert.equal(consecutiveSameGroup(plan.sessions), false);
});

for (const n of [2, 3, 4, 5, 6]) {
  test(`${n} sessions: all placed, distinct days, no same-muscle back-to-back`, () => {
    const plan = planWeek(profile(n), school, win);
    assert.equal(plan.sessions.length, n);
    assert.equal(new Set(plan.sessions.map((s) => s.day)).size, n);
    assert.equal(consecutiveSameGroup(plan.sessions), false);
  });
}

test('leg sessions avoid a hard game and the day before it', () => {
  const blocks = [...school, { day: 2, start: '16:00', end: '18:00', type: 'sport', intensity: 'hard', label: 'Basketball game' }];
  const plan = planWeek(profile(4), blocks, win);
  const legDays = plan.sessions.filter((s) => SESSIONS[s.key].legs === 'heavy').map((s) => s.day);
  assert.ok(!legDays.includes(2), 'no legs on game day');
  assert.ok(!legDays.includes(1), 'no legs the day before');
  assert.equal(plan.warnings.filter((w) => w.kind === 'legs').length, 0);
});

test('fewer free days than target reduces sessions and warns', () => {
  const busy = [0, 1, 2, 3, 4, 5].map((day) => ({ day, start: '06:00', end: '21:00', type: 'other', label: 'Busy' }));
  const plan = planWeek(profile(3), busy, win);
  assert.equal(plan.sessions.length, 1);
  assert.equal(plan.sessions[0].day, 6);
  assert.ok(plan.warnings.some((w) => w.kind === 'capacity'));
});

test('short gap gives a short session with fewer exercises', () => {
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '07:00', end: '21:00', type: 'other', label: 'Busy' }));
  const plan = planWeek(profile(2), blocks, win);
  assert.equal(plan.sessions.length, 2);
  assert.ok(plan.sessions.every((s) => s.short && s.exercises.length === 3));
});

test('week A/B alternates from the anchor', () => {
  const anchor = { week: '2026-11-02', type: 'A' };
  assert.equal(weekType('2026-11-02', anchor), 'A');
  assert.equal(weekType('2026-11-09', anchor), 'B');
  assert.equal(weekType('2026-10-26', anchor), 'B');
  assert.equal(weekType('2026-11-16', anchor), 'A');
});

test('weekKey returns the Monday', () => {
  assert.equal(weekKey(new Date(2026, 10, 5)), '2026-11-02'); // Thursday
  assert.equal(weekKey(new Date(2026, 10, 8)), '2026-11-02'); // Sunday
  assert.equal(addWeeks('2026-11-02', 1), '2026-11-09');
});

test('weekly streak counts consecutive met weeks, sport credit capped at one', () => {
  const cur = '2026-11-02';
  const h = {
    '2026-10-12': { done: ['a', 'b', 'c'] },
    '2026-10-19': { done: ['a'] },           // broken
    '2026-10-26': { done: ['a', 'b'] },      // met with sport credit
    [cur]: { done: ['a', 'b', 'c'] },
  };
  const credit = () => 2; // two hard sport sessions, only one counts
  const s = streakInfo(h, cur, 3, credit);
  assert.equal(s.current, 2);
  assert.equal(s.thisWeekMet, true);
  assert.equal(s.longest, 2);
  const s2 = streakInfo(h, cur, 3, () => 0);
  assert.equal(s2.current, 1);
});

// ---------- stage 2: re-planning ----------
import { busyCount, sessionKeysFor } from '../js/scheduler.js';

test('missed session moves to a later free day, done sessions stay put', () => {
  const p = profile(3);
  const base = planWeek(p, school, win);
  const [first, second, third] = base.sessions;
  // first done; second missed today; replan from the day after
  const fixed = [{ key: first.key, day: first.day, start: first.start, end: first.end }];
  const keys = [second.key, third.key];
  const re = planWeek(p, school, win, { fixed, keys, fromDay: second.day + 1 });
  assert.equal(re.sessions.length, 2);
  assert.ok(re.sessions.every((s) => s.day > second.day));
  assert.ok(re.sessions.every((s) => s.day !== first.day));
  assert.equal(consecutiveSameGroup([...fixed, ...re.sessions]), false);
});

test('not enough days left: main lifts merge into another session', () => {
  const p = profile(4);
  // Only Saturday and Sunday left, three sessions to place.
  const re = planWeek(p, school, win, { keys: ['lowerA', 'upperB', 'lowerB'], fromDay: 5 });
  assert.equal(re.sessions.length, 2);
  assert.equal(re.dropped.length, 1);
  const host = re.sessions.find((s) => s.merged);
  assert.ok(host, 'one session absorbs the dropped lifts');
  assert.ok(host.merged.includes(re.dropped[0]));
  const moves = new Set(host.exercises.map((x) => x.move));
  assert.ok(['squat', 'hinge'].every((m) => moves.has(m)), 'dropped session main lifts are covered');
  assert.ok(re.warnings.some((w) => w.kind === 'merged'));
});

test('no days left at all says so', () => {
  const full = [{ day: 6, start: '06:00', end: '21:00', type: 'other', label: 'Away' }];
  const re = planWeek(profile(3), full, win, { keys: ['fullC'], fromDay: 6 });
  assert.equal(re.sessions.length, 0);
  assert.ok(re.warnings.some((w) => w.kind === 'none'));
});

test('today only uses time that has not passed yet', () => {
  const re = planWeek(profile(2), school, win, { fromDay: 0, nowMin: toMin('19:30'), keys: ['fullA'] });
  assert.ok(re.sessions[0].day !== 0 || re.sessions[0].start >= toMin('19:45'));
  const late = planWeek(profile(2), school, win, { fromDay: 0, nowMin: toMin('20:50'), keys: ['fullA'] });
  assert.notEqual(late.sessions[0].day, 0);
});

test('busy week: fewer, shorter sessions with main lifts only', () => {
  const p = profile(5);
  assert.equal(busyCount(5), 3);
  assert.equal(busyCount(4), 2);
  const keys = sessionKeysFor(p, true);
  const re = planWeek(p, school, win, { busy: true });
  assert.equal(re.sessions.length, keys.length);
  assert.ok(re.sessions.every((s) => s.end - s.start <= 45 && s.exercises.length === 3));
});

test('streak target can change per week', () => {
  const h = { '2026-10-26': { done: ['a', 'b'] }, '2026-11-02': { done: ['a', 'b'] } };
  const busyWeeks = new Set(['2026-10-26', '2026-11-02']);
  const s = streakInfo(h, '2026-11-02', (k) => (busyWeeks.has(k) ? 2 : 4), () => 0);
  assert.equal(s.current, 2);
});

test('merging an upper session into a lower one adds its main lifts', () => {
  const re = planWeek(profile(4), school, win, { keys: ['upperA', 'lowerB'], fromDay: 6 });
  assert.equal(re.sessions.length, 1);
  const host = re.sessions[0];
  assert.ok(host.exercises.some((x) => x.from), 'extra lifts added');
});

test('skipped days are never used', () => {
  const re = planWeek(profile(3), school, win, { skipDays: [0, 2, 4] });
  assert.ok(re.sessions.every((s) => ![0, 2, 4].includes(s.day)));
  assert.equal(re.sessions.length, 3);
});
