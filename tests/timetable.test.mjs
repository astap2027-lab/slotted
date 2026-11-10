import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAvailability, validateChange, applyChanges, weekBlocks, windowFor, appliesTo, describeChange, cleanChanges, touchesFixed, timetableContext,
} from '../js/timetable.js';
import { planWeek, freeGaps } from '../js/scheduler.js';

const KEY = '2026-11-09'; // a Monday
const school = (d) => ({ id: `s${d}`, day: d, start: '08:30', end: '15:10', type: 'school', label: 'School' });
const base = () => ({
  useAB: false, abAnchor: null, window: { start: '06:00', end: '21:00' }, restDays: [], history: {},
  blocks: { A: [0, 1, 2, 3, 4].map(school), B: [] },
});
const parse = (t, todayIdx = 0) => parseAvailability(t, { todayIdx }).changes;

test('“I finish school at 1:05 pm every Tuesday” changes Tuesday’s school every week', () => {
  const ch = parse('I finish school at 1:05 pm every Tuesday');
  assert.deepEqual(ch, [{ op: 'set_times', match: { type: 'school', day: 1 }, end: '13:05', scope: 'always' }]);
  const st = base();
  assert.deepEqual(validateChange(ch[0], st, KEY), []);
  const out = applyChanges(st, ch, KEY);
  assert.equal(out.blocks.A.find((b) => b.day === 1).end, '13:05');
  assert.equal(out.blocks.A.find((b) => b.day === 2).end, '15:10', 'other days untouched');
  assert.equal(st.blocks.A.find((b) => b.day === 1).end, '15:10', 'the original state is not changed');
  assert.equal(describeChange(ch[0], KEY), 'School finishes at 1:05pm every Tuesday');
});

test('“I start school at 9:40 am on Fridays”', () => {
  const ch = parse('I start school at 9:40 am on Fridays');
  assert.deepEqual(ch, [{ op: 'set_times', match: { type: 'school', day: 4 }, start: '09:40', scope: 'always' }]);
  assert.equal(applyChanges(base(), ch, KEY).blocks.A.find((b) => b.day === 4).start, '09:40');
});

test('“I have basketball training on Thursday from 4–6 pm” adds a sport commitment', () => {
  const ch = parse('I have basketball training on Thursday from 4–6 pm');
  assert.equal(ch.length, 1);
  assert.equal(ch[0].op, 'add');
  assert.deepEqual(ch[0].days, [3]);
  assert.equal(ch[0].start, '16:00'); assert.equal(ch[0].end, '18:00');
  assert.equal(ch[0].block.type, 'sport'); assert.equal(ch[0].block.intensity, 'light');
  assert.equal(ch[0].block.label, 'Basketball training');
  const out = applyChanges(base(), ch, KEY);
  assert.ok(out.blocks.A.some((b) => b.day === 3 && b.label === 'Basketball training' && b.start === '16:00'));
  assert.equal(parse('Netball game Saturday 11-1pm')[0].start, '11:00', '11–1 pm starts in the morning');
});

test('“I cannot train this Saturday” is a one-off', () => {
  const ch = parse('I cannot train this Saturday', 2);
  assert.deepEqual(ch, [{ op: 'skip_day', day: 5, week: 'this' }]);
  const out = applyChanges(base(), ch, KEY, 2);
  assert.deepEqual(out.history[KEY].skipDays, [5]);
  assert.equal(describeChange(ch[0], KEY, 2), 'No training this Saturday');
  // Said on a Sunday, "Saturday" means next week's.
  const late = applyChanges(base(), parse('I can’t train Saturday', 6), KEY, 6);
  assert.deepEqual(late.history['2026-11-16'].skipDays, [5]);
});

test('“I have more free time on Wednesday mornings” opens Wednesday mornings', () => {
  const st = { ...base(), window: { start: '14:00', end: '21:00' } };
  const ch = parse('I have more free time on Wednesday mornings');
  assert.deepEqual(ch, [{ op: 'day_window', day: 2, start: '06:00', scope: 'always' }]);
  const out = applyChanges(st, ch, KEY);
  assert.deepEqual(windowFor(out, KEY, 2), { start: '06:00', end: '21:00' });
  assert.deepEqual(windowFor(out, KEY, 3), { start: '14:00', end: '21:00' });
});

test('how they feel is noted for today: sore legs, exhausted; recovered parts are left out', () => {
  const ch = parse('My legs are still sore and I’m feeling exhausted. Can you reorganise the rest of my week?', 2);
  assert.equal(ch[0].op, 'feel');
  assert.deepEqual(ch[0].sore, ['quads', 'hamstrings', 'glutes', 'calves']);
  assert.equal(ch[0].tired, true);
  const out = applyChanges(base(), ch, KEY, 2);
  assert.equal(out.history[KEY].reports[2].tired, true);
  const mixed = parse('My biceps are fatigued, but my legs are recovered');
  assert.deepEqual(mixed[0].sore, ['biceps']);
  assert.ok(mixed[0].fresh.includes('quads'));
});

test('one-off changes only affect that week, and template commitments are hidden, not deleted', () => {
  const ch = [{ op: 'set_times', match: { type: 'school', day: 1 }, end: '12:00', scope: 'once', week: 'this' }];
  const out = applyChanges(base(), ch, KEY);
  const thisWeek = weekBlocks(out, KEY).filter((b) => b.day === 1);
  assert.equal(thisWeek.length, 1); assert.equal(thisWeek[0].end, '12:00'); assert.equal(thisWeek[0].once, true);
  assert.equal(weekBlocks(out, '2026-11-16').find((b) => b.day === 1).end, '15:10', 'next week is back to normal');
  assert.equal(out.blocks.A.length, 5);
});

test('fortnightly and rotating commitments apply every few weeks; Week A and B still work', () => {
  const b = { id: 'x', day: 2, start: '17:00', end: '18:00', type: 'other', label: 'Tutoring', every: 2, anchor: KEY };
  assert.equal(appliesTo(b, KEY), true);
  assert.equal(appliesTo(b, '2026-11-16'), false);
  assert.equal(appliesTo(b, '2026-11-23'), true);
  assert.equal(appliesTo(b, '2026-11-02'), false, 'and backwards');
  assert.equal(appliesTo({ ...b, every: 3 }, '2026-11-30'), true);
  const ab = { ...base(), useAB: true, abAnchor: { week: KEY, type: 'A' }, blocks: { A: [school(0)], B: [{ ...school(0), id: 'b0', end: '12:00' }] } };
  assert.equal(weekBlocks(ab, KEY)[0].end, '15:10');
  assert.equal(weekBlocks(ab, '2026-11-16')[0].end, '12:00');
  const added = applyChanges(ab, [{ op: 'add', days: [4], start: '16:00', end: '17:00', scope: 'always', block: { type: 'sport', label: 'Gym club' } }], KEY);
  assert.ok(added.blocks.A.some((x) => x.label === 'Gym club') && added.blocks.B.some((x) => x.label === 'Gym club'), 'recurring additions go in both weeks');
});

test('travel and preparation time block extra time around a commitment', () => {
  const plain = freeGaps([{ day: 0, start: '16:00', end: '17:00' }], 0, { start: '15:00', end: '20:00' });
  const travel = freeGaps([{ day: 0, start: '16:00', end: '17:00', before: 30, after: 20 }], 0, { start: '15:00', end: '20:00' });
  assert.deepEqual(plain, [[900, 945], [1035, 1200]]);
  assert.deepEqual(travel, [[900, 915], [1055, 1200]], 'travel time eats into the gaps either side');
});

test('per-day training hours reach the planner', () => {
  const profile = { goal: 'muscle', level: 'beginner', equipment: 'gym', sessionsPerWeek: 2, sessionLength: 60, timeOfDay: 'morning' };
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, start: '07:30', end: '20:30', type: 'other', label: 'Busy' }));
  const none = planWeek(profile, blocks, { start: '07:00', end: '21:00' });
  assert.equal(none.sessions.length, 0);
  const some = planWeek(profile, blocks, { start: '07:00', end: '21:00' }, { dayWindows: { 2: { start: '05:30', end: '21:00' } } });
  assert.deepEqual(some.sessions.map((s) => s.day), [2]);
});

test('bad changes are caught before anything happens', () => {
  const st = base();
  assert.ok(validateChange({ op: 'set_times', match: { type: 'school', day: 5 }, end: '13:00', scope: 'always' }, st, KEY)[0].includes('no school on Saturday'));
  assert.ok(validateChange({ op: 'add', days: [1], start: '18:00', end: '17:00', scope: 'always', block: { type: 'sport' } }, st, KEY).length);
  assert.ok(validateChange({ op: 'set_times', match: { type: 'school', day: 1 }, end: '07:00', scope: 'always' }, st, KEY).length, 'finishing before it starts');
  assert.ok(validateChange({ op: 'delete_everything' }, st, KEY).length);
  assert.ok(validateChange({ op: 'skip_day', day: 9 }, st, KEY).length);
  assert.ok(validateChange({ op: 'day_window', day: 1, start: '25:00' }, st, KEY).length);
});

test('changes to fixed commitments are flagged in the preview', () => {
  const st = base();
  assert.equal(touchesFixed({ op: 'set_times', match: { type: 'school', day: 1 }, end: '13:05', scope: 'always' }, st, KEY), true);
  st.blocks.A[1].flex = true;
  assert.equal(touchesFixed({ op: 'set_times', match: { type: 'school', day: 1 }, end: '13:05', scope: 'always' }, st, KEY), false);
});

test('AI output is trimmed to fields the app understands', () => {
  const out = cleanChanges([{ op: 'add', days: [1], start: '16:00', end: '17:00', block: { label: 'x'.repeat(80), type: 'sport', hack: 1 }, evil: true }]);
  assert.equal(out[0].evil, undefined);
  assert.equal(out[0].block.hack, undefined);
  assert.equal(out[0].block.label.length, 40);
  assert.deepEqual(cleanChanges('nope'), []);
});

test('unknown sentences are left for the AI', () => {
  const r = parseAvailability('Something completely different', { todayIdx: 0 });
  assert.equal(r.understood, false);
  assert.ok(timetableContext(base(), KEY, 0).includes('Tue: School (school) 08:30-15:10'));
});

test('the timetable endpoint forces structured output and cleans it', async () => {
  const { onRequestPost } = await import('../functions/api/timetable.js');
  const req = (body) => new Request('https://slotted.pages.dev/api/timetable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await onRequestPost({ request: req({ text: 'hi' }), env: {} })).status, 503);
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'timetable_changes', input: { changes: [{ op: 'skip_day', day: 5, week: 'this', extra: 'x' }], note: 'ok' } }] }), { status: 200 });
  };
  const res = await onRequestPost({ request: req({ text: 'Swimming carnival on Saturday so no gym', context: 'Mon: free' }), env: { ANTHROPIC_API_KEY: 'k' } });
  const out = await res.json();
  assert.deepEqual(out.changes, [{ op: 'skip_day', day: 5, week: 'this' }]);
  assert.equal(sent.tool_choice.name, 'timetable_changes');
  assert.equal(sent.thinking.type, 'disabled');
  assert.equal(sent.model, 'claude-haiku-5-5');
  assert.match(sent.system, /Mon: free/);
});

test('flexible commitments give way only when the week is too full; fixed ones never do', async () => {
  const { planWithFlex } = await import('../js/timetable.js');
  const profile = { goal: 'muscle', level: 'beginner', equipment: 'gym', sessionsPerWeek: 2, sessionLength: 60, timeOfDay: 'afternoon' };
  const keys = ['fullA', 'fullB'];
  const win = { start: '15:00', end: '19:00' };
  const full = (flexDays) => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, start: '15:00', end: '19:00', type: 'other', label: d === 2 ? 'Homework club' : 'Busy', ...(flexDays.includes(d) ? { flex: true } : {}) }));
  const fixedOnly = planWithFlex(profile, full([]), win, { keys });
  assert.equal(fixedOnly.sessions.length, 0, 'fixed commitments always block');
  const withFlex = planWithFlex(profile, full([2]), win, { keys });
  assert.equal(withFlex.sessions.length, 1);
  assert.equal(withFlex.sessions[0].day, 2);
  assert.ok(withFlex.sessions[0].notes.includes('Overlaps Homework club (flexible)'));
  const roomy = [{ day: 2, start: '15:00', end: '16:00', type: 'other', label: 'Homework club', flex: true }];
  const normal = planWithFlex(profile, roomy, win, { keys });
  assert.ok(normal.sessions.every((s) => !s.notes.some((n) => n.startsWith('Overlaps'))), 'with room, flexible ones are respected');
});

// ---------- effort levels ----------
test('easy sport sessions do not push leg work away; games still do', async () => {
  const profile = { goal: 'muscle', level: 'beginner', equipment: 'gym', sessionsPerWeek: 4, sessionLength: 60, timeOfDay: 'afternoon' };
  const win = { start: '15:00', end: '21:00' };
  // Sport on four days; only those four days are free for the gym.
  const blocks = (intensity) => [
    ...[0, 1, 2, 3].map((d) => ({ day: d, start: '19:00', end: '20:00', type: 'sport', label: 'Club', intensity })),
    ...[4, 5, 6].map((d) => ({ day: d, start: '06:00', end: '22:00', type: 'other', label: 'Away' })),
  ];
  const legWarnings = (i) => planWeek(profile, blocks(i), win).warnings.filter((w) => w.kind === 'legs').length;
  assert.ok(legWarnings('hard') > 0, 'games clash with leg days');
  assert.equal(legWarnings('easy'), 0, 'easy sessions never count as hard sport');
});

test('the hardest sport on a day is the one the planner works around', () => {
  const profile = { goal: 'muscle', level: 'beginner', equipment: 'gym', sessionsPerWeek: 2, sessionLength: 60, timeOfDay: 'afternoon' };
  const blocks = [
    { day: 1, start: '07:00', end: '07:30', type: 'sport', label: 'Stretch', intensity: 'easy' },
    { day: 1, start: '18:00', end: '19:30', type: 'sport', label: 'Rugby game', intensity: 'hard' },
    ...[0, 2, 3, 4, 5, 6].map((d) => ({ day: d, start: '06:00', end: '22:00', type: 'other', label: 'Away' })),
  ];
  const res = planWeek(profile, blocks, { start: '09:00', end: '17:00' });
  assert.ok(res.sessions[0].notes.includes('Rugby game today'));
});

test('effort levels are stored, described and read from plain words', () => {
  const out = applyChanges(base(), [{ op: 'add', days: [2], start: '16:00', end: '17:00', scope: 'always', block: { type: 'sport', label: 'Yoga', intensity: 'easy' } }], KEY);
  assert.equal(out.blocks.A.find((b) => b.label === 'Yoga').intensity, 'easy');
  const odd = applyChanges(base(), [{ op: 'add', days: [2], start: '16:00', end: '17:00', scope: 'always', block: { type: 'sport', label: 'X', intensity: 'extreme' } }], KEY);
  assert.equal(odd.blocks.A.find((b) => b.label === 'X').intensity, 'light', 'unknown values fall back to training');
  assert.equal(parse('I have recovery swimming on Monday from 6-7am')[0].block.intensity, 'easy');
  assert.match(describeChange({ op: 'add', days: [2], start: '16:00', end: '17:00', scope: 'always', block: { type: 'sport', label: 'Yoga', intensity: 'easy' } }, KEY), /easy session/);
});

// ---------- timetable photo ----------
test('a photo’s class periods become one School block per day, with each day’s own times', async () => {
  const { photoChanges } = await import('../js/timetable.js');
  const empty = { ...base(), blocks: { A: [], B: [] } };
  const read = [
    { op: 'add', days: [0], start: '08:30', end: '09:20', scope: 'always', block: { type: 'school', label: 'Maths' } },
    { op: 'add', days: [0], start: '14:20', end: '15:10', scope: 'always', block: { type: 'school', label: 'English' } },
    { op: 'add', days: [1], start: '08:30', end: '13:05', scope: 'always', block: { type: 'school', label: 'School' } },
    { op: 'add', days: [3], start: '16:00', end: '18:00', scope: 'always', block: { type: 'sport', label: 'Basketball training', intensity: 'light' } },
  ];
  const out = photoChanges(read, empty);
  assert.deepEqual(out.map((c) => [c.op, c.days[0], c.start, c.end, c.block.label]), [
    ['add', 0, '08:30', '15:10', 'School'], ['add', 1, '08:30', '13:05', 'School'], ['add', 3, '16:00', '18:00', 'Basketball training'],
  ]);
  for (const c of out) assert.deepEqual(validateChange(c, empty, KEY), []);
});

test('a photo updates school that already exists instead of doubling it, and skips what is already there', async () => {
  const { photoChanges } = await import('../js/timetable.js');
  const st = base();
  st.blocks.A.push({ id: 'bb', day: 3, start: '16:00', end: '18:00', type: 'sport', label: 'Basketball training', intensity: 'light' });
  const out = photoChanges([
    { op: 'add', days: [1], start: '08:30', end: '13:05', scope: 'always', block: { type: 'school', label: 'School' } },
    { op: 'add', days: [2], start: '08:30', end: '15:10', scope: 'always', block: { type: 'school', label: 'School' } },
    { op: 'add', days: [3], start: '16:00', end: '18:00', scope: 'always', block: { type: 'sport', label: 'basketball training' } },
  ], st);
  assert.deepEqual(out, [{ op: 'set_times', match: { type: 'school', day: 1 }, start: '08:30', end: '13:05', scope: 'always' }]);
  const applied = applyChanges(st, out, KEY);
  assert.equal(applied.blocks.A.filter((b) => b.day === 1 && b.type === 'school').length, 1);
  assert.equal(applied.blocks.A.find((b) => b.day === 1).end, '13:05');
});

test('a photo never removes anything, and unreadable entries are dropped', async () => {
  const { photoChanges } = await import('../js/timetable.js');
  const out = photoChanges([
    { op: 'remove', match: { type: 'school', day: 1 }, scope: 'always' },
    { op: 'feel', sore: ['quads'], tired: true },
    { op: 'skip_day', day: 2 },
    { op: 'add', days: [9], start: '16:00', end: '17:00', block: { type: 'sport', label: 'X' } },
    { op: 'add', days: [2], start: '4pm', end: '17:00', block: { type: 'sport', label: 'Y' } },
  ], base());
  assert.deepEqual(out, []);
});

test('with Week A and B, a photo can change just one week', async () => {
  const { photoChanges } = await import('../js/timetable.js');
  const ab = { ...base(), useAB: true, abAnchor: { week: KEY, type: 'A' }, blocks: { A: [school(0)], B: [school(0)] } };
  const read = [{ op: 'add', days: [0], start: '08:30', end: '12:00', scope: 'always', block: { type: 'school', label: 'School' } }];
  const out = applyChanges(ab, photoChanges(read, ab, { templates: ['B'] }), KEY, 0, { templates: ['B'] });
  assert.equal(out.blocks.A[0].end, '15:10', 'Week A untouched');
  assert.equal(out.blocks.B[0].end, '12:00');
  const both = applyChanges(ab, photoChanges(read, ab), KEY);
  assert.equal(both.blocks.A[0].end, '12:00'); assert.equal(both.blocks.B[0].end, '12:00');
});

// A Monday as printed on a class timetable: period 1 is a free study period, period 6 is empty.
const rows = (spec) => spec.map(([label, start, end, free]) => ({ label, start, end, free: !!free }));
const MON = rows([['Study', '08:45', '09:35', true], ['Maths', '09:35', '10:25'], ['English', '10:25', '11:15'], ['Recess', '11:15', '11:35'], ['Science', '11:35', '12:25'], ['Lunch', '12:25', '13:05'], ['PE', '13:05', '13:55'], ['', '13:55', '14:45']]);

test('school runs from the first class to the last, ignoring free periods at either end and breaks in the middle', async () => {
  const { schoolDay } = await import('../js/timetable.js');
  const d = schoolDay(MON);
  assert.equal(d.start, '09:35'); assert.equal(d.end, '13:55');
  assert.equal(d.classes, 4); assert.equal(d.firstClass, 'Maths'); assert.equal(d.lastClass, 'PE');
  assert.equal(d.freeBefore, 1); assert.equal(d.freeAfter, 1);
  assert.equal(schoolDay(rows([['Maths', '1:05', '1:55']])).start, '13:05', 'afternoon times without am/pm');
  assert.equal(schoolDay(rows([['Maths', '9:00', '8:00'], ['X', 'abc', '10:00']])), null, 'unreadable rows are dropped');
  assert.equal(schoolDay(rows([['Study', '09:00', '09:50', true]])), null, 'a day with no classes has no school');
  assert.equal(schoolDay(rows([['Lunch', '12:00', '12:40'], ['Maths', '12:40', '13:30']])).start, '12:40', 'a break at the start isn’t a class');
  assert.equal(schoolDay(rows([['Maths', '09:00', '15:30']])), null, 'a six hour “period” is a misread');
});

test('a photo plan has one school block per day with each day’s own times', async () => {
  const { photoPlan, validateChange } = await import('../js/timetable.js');
  const st = { ...base(), blocks: { A: [], B: [] } };
  const result = { photos: [{ photo: 1, week: 'none', days: [
    { day: 'Mon', periods: MON },
    { day: 'Tue', periods: rows([['Maths', '08:45', '09:35'], ['English', '09:35', '10:25'], ['Study', '10:25', '11:15', true]]) },
  ] }], other: [{ photo: 1, day: 'Thu', label: 'Basketball', type: 'sport', intensity: 'light', start: '16:00', end: '18:00' }], unreadable: ['Wednesday period 4'] };
  const plan = photoPlan(result, st);
  assert.equal(plan.groups.length, 1); assert.equal(plan.groups[0].week, 'all');
  assert.deepEqual(plan.groups[0].changes.map((c) => [c.days[0], c.start, c.end, c.block.label]), [
    [0, '09:35', '13:55', 'School'], [1, '08:45', '10:25', 'School'], [3, '16:00', '18:00', 'Basketball'],
  ]);
  for (const c of plan.groups[0].changes) assert.deepEqual(validateChange(c, st, KEY), []);
  assert.deepEqual(plan.unreadable, ['Wednesday period 4']);
});

test('with Week A and B, two photos become Week A and Week B, labels win, and they can be swapped', async () => {
  const { photoPlan } = await import('../js/timetable.js');
  const ab = { ...base(), useAB: true, abAnchor: { week: KEY, type: 'A' }, blocks: { A: [], B: [] } };
  const day = (end) => [{ day: 'Mon', periods: rows([['Maths', '08:45', end]]) }];
  const two = (la, lb) => ({ photos: [{ photo: 1, week: la, days: day('09:35') }, { photo: 2, week: lb, days: day('10:25') }] });
  const ends = (p) => Object.fromEntries(p.groups.map((g) => [g.week, g.changes[0].end]));
  assert.deepEqual(ends(photoPlan(two('none', 'none'), ab)), { A: '09:35', B: '10:25' }, 'photo 1 is A, photo 2 is B');
  assert.deepEqual(ends(photoPlan(two('B', 'A'), ab)), { A: '10:25', B: '09:35' }, 'printed labels win');
  assert.deepEqual(ends(photoPlan(two('none', 'none'), ab, { swap: true })), { A: '10:25', B: '09:35' });
  assert.deepEqual(ends(photoPlan(two('A', 'none'), ab)), { A: '09:35', B: '10:25' }, 'one label places the other photo');
  const one = { photos: [{ photo: 1, week: 'none', days: day('09:35') }] };
  assert.deepEqual(photoPlan(one, ab, { choice: 'B' }).groups.map((g) => g.week), ['B']);
  assert.deepEqual(photoPlan(one, ab, { choice: 'both' }).groups.map((g) => g.week), ['all']);
  assert.equal(photoPlan(two('none', 'none'), { ...ab, useAB: false }).notes.length, 1, 'different weeks without A/B on: say so');
});

test('the photo plan applies each week to its own timetable and never touches the other', async () => {
  const { photoPlan, applyChanges } = await import('../js/timetable.js');
  const ab = { ...base(), useAB: true, abAnchor: { week: KEY, type: 'A' }, blocks: { A: [school(0)], B: [school(0)] } };
  const day = (last, end) => [{ day: 'Mon', periods: rows([['Maths', '08:30', '09:20'], ['PE', last, end]]) }];
  const plan = photoPlan({ photos: [{ photo: 1, week: 'A', days: day('11:10', '12:00') }, { photo: 2, week: 'B', days: day('12:40', '13:30') }] }, ab);
  const out = plan.groups.reduce((acc, g) => applyChanges(acc, g.changes, KEY, 0, { templates: g.templates }), ab);
  assert.equal(out.blocks.A.length, 1); assert.equal(out.blocks.A[0].end, '12:00');
  assert.equal(out.blocks.B.length, 1); assert.equal(out.blocks.B[0].end, '13:30');
});

test('garbage from the model never breaks the plan', async () => {
  const { photoPlan } = await import('../js/timetable.js');
  for (const r of [null, {}, { photos: 'x' }, { photos: [null, { days: [{ day: 'Funday', periods: 5 }] }], other: [{}, null], unreadable: [1, '  '] }]) {
    const plan = photoPlan(r, base());
    assert.deepEqual(plan.groups, []); assert.deepEqual(plan.unreadable, []);
  }
});

test('the timetable endpoint reads photos with the stronger model, falls back, and refuses bad ones', async () => {
  const { onRequestPost } = await import('../functions/api/timetable.js');
  const req = (body) => new Request('https://slotted.pages.dev/api/timetable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const env = { ANTHROPIC_API_KEY: 'k' };
  const photo = { photos: [{ photo: 1, week: 'A', days: [] }], other: [], unreadable: [] };
  const calls = [];
  const reply = (input) => new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '' }, ...(input ? [{ type: 'tool_use', name: 'timetable_photo', input }] : [{ type: 'text', text: 'hm' }])] }), { status: 200 });
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return reply(photo); };
  const images = [{ media_type: 'image/jpeg', data: 'QUJD' }, { media_type: 'image/png', data: 'REVG' }];
  const res = await onRequestPost({ request: req({ images, context: 'Mon: free' }), env });
  assert.deepEqual(await res.json(), { photo });
  assert.equal(calls.length, 1);
  const sent = calls[0];
  assert.equal(sent.model, 'claude-sonnet-5-5');
  assert.deepEqual(sent.tool_choice, { type: 'auto' }, 'Sonnet 5.5 cannot be forced to call a tool');
  assert.equal(sent.thinking, undefined, 'Sonnet 5.5 cannot have thinking disabled');
  assert.equal(sent.tools[0].name, 'timetable_photo'); assert.equal(sent.tools[0].strict, true);
  assert.equal(sent.tools[0].input_schema.additionalProperties, false);
  const c = sent.messages[0].content;
  assert.equal(c.filter((b) => b.type === 'image').length, 2);
  assert.deepEqual(c[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.match(sent.system, /transcribing, not summarising/);
  assert.match(c[c.length - 1].text, /timetable_photo tool/);

  // The stronger model doesn't answer with the tool: the coach's model gets one try.
  calls.length = 0;
  globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); calls.push(b); return reply(b.model === 'claude-sonnet-5-5' ? null : photo); };
  assert.deepEqual(await (await onRequestPost({ request: req({ images }), env })).json(), { photo });
  assert.deepEqual(calls.map((b) => b.model), ['claude-sonnet-5-5', 'claude-haiku-5-5']);
  assert.deepEqual(calls[1].tool_choice, { type: 'tool', name: 'timetable_photo' });
  assert.deepEqual(calls[1].thinking, { type: 'disabled' });

  // Both fail: a plain message, not a crash. Upstream trouble is reported as such.
  globalThis.fetch = async () => reply(null);
  const none = await (await onRequestPost({ request: req({ images }), env })).json();
  assert.equal(none.photo, null); assert.match(none.note, /couldn’t be read/);
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  assert.equal((await onRequestPost({ request: req({ images }), env })).status, 502);

  // Typed sentences are unchanged: the coach's model with a forced tool.
  calls.length = 0;
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'timetable_changes', input: { changes: [{ op: 'skip_day', day: 5, week: 'this' }] } }] }), { status: 200 }); };
  assert.deepEqual((await (await onRequestPost({ request: req({ text: 'no gym saturday' }), env })).json()).changes, [{ op: 'skip_day', day: 5, week: 'this' }]);
  assert.equal(calls[0].model, 'claude-haiku-5-5'); assert.deepEqual(calls[0].tool_choice, { type: 'tool', name: 'timetable_changes' });

  calls.length = 0;
  for (const bad of [
    [{ media_type: 'application/pdf', data: 'QUJD' }],
    [{ media_type: 'image/png', data: 'not base64!' }],
    [{ media_type: 'image/png', data: 'A'.repeat(4000001) }],
    [1, 2, 3].map(() => ({ media_type: 'image/png', data: 'QUJD' })),
  ]) assert.equal((await onRequestPost({ request: req({ images: bad }), env })).status, 400);
  assert.equal(calls.length, 0, 'rejected photos never reach the model');
});
