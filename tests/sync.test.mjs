import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, forUpload } from '../js/sync.js';

const phone = {
  updatedAt: 200,
  profile: { sessionsPerWeek: 4 },
  history: { '2026-11-02': { done: ['upperA'], skipDays: [3], checkins: { 3: { sleep: 2 } }, plan: [{ key: 'upperA' }] } },
  log: { '2026-11-02': { upperA: { squat: [{ kg: 50, reps: 8, done: true }, { kg: 50, reps: '', done: false }] } } },
  exerciseNames: { x_a: 'A' },
  installDismissed: true,
  syncedAt: 150,
};
const laptop = {
  updatedAt: 100,
  profile: { sessionsPerWeek: 3 },
  history: {
    '2026-11-02': { done: ['lowerA'], skipDays: [], checkins: {}, plan: [{ key: 'old' }] },
    '2026-10-26': { done: ['upperA', 'lowerA'] },
  },
  log: { '2026-11-02': { upperA: { squat: [{ kg: 45, reps: 8, done: true }, { kg: 50, reps: 7, done: true }] }, lowerA: { hinge: [{ kg: 60, reps: 5, done: true }] } } },
  exerciseNames: { x_b: 'B' },
};

test('settings come from the newer copy', () => {
  const m = mergeStates(phone, laptop);
  assert.equal(m.profile.sessionsPerWeek, 4);
  assert.equal(m.updatedAt, 200);
});

test('finished sessions, skipped days and whole weeks from both copies are kept', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.history['2026-11-02'].done.sort(), ['lowerA', 'upperA']);
  assert.deepEqual(m.history['2026-11-02'].skipDays, [3]);
  assert.deepEqual(m.history['2026-11-02'].plan, [{ key: 'upperA' }]);
  assert.ok(m.history['2026-10-26']);
});

test('logged sets merge set by set, preferring ticked sets and the newer copy', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.log['2026-11-02'].upperA.squat, [{ kg: 50, reps: 8, done: true }, { kg: 50, reps: 7, done: true }]);
  assert.deepEqual(m.log['2026-11-02'].lowerA.hinge, [{ kg: 60, reps: 5, done: true }]);
  assert.deepEqual(m.exerciseNames, { x_a: 'A', x_b: 'B' });
});

test('merging is the same whichever side asks', () => {
  assert.deepEqual(mergeStates(laptop, phone).log, mergeStates(phone, laptop).log);
});

test('device-only settings never upload', () => {
  const up = forUpload(phone);
  assert.equal(up.installDismissed, undefined);
  assert.equal(up.syncedAt, undefined);
  assert.equal(up.profile.sessionsPerWeek, 4);
});

// ---------- the upgrade's data (Stages 1 to 3) ----------
const wk = '2026-11-02';
const newer = {
  updatedAt: 300, units: 'lb', dayWindows: { 2: { start: '06:00', end: '21:00' } },
  customExercises: [{ id: 'u_1', name: 'Zercher wobble squat', deleted: true }],
  history: { [wk]: {
    done: [], plan: [{ key: 'upperA', day: 1, locked: true }], extra: [{ id: 'e1', day: 5, start: '09:00', end: '11:00', type: 'sport', label: 'Carnival' }],
    hidden: ['s1'], windows: { 4: { start: '06:00', end: '21:00' } }, lighten: ['upperA'], reports: { 1: { sore: ['quads'], tired: true } }, dismissed: ['move:a'],
  } },
  log: { [wk]: { upperA: { 'x_plank': [{ sec: 45, done: true, effort: 'fail' }], 'x_farmers-carry': [{ kg: 24, m: 40, done: true, effort: 'easy' }] } } },
};
const older = {
  updatedAt: 200, units: 'kg',
  customExercises: [{ id: 'u_1', name: 'Zercher wobble squat' }, { id: 'u_2', name: 'Landmine twist' }],
  history: { [wk]: { done: ['upperA'], reports: { 0: { sore: [], tired: false } }, dismissed: ['swap:b'] } },
  log: { [wk]: { upperA: { 'x_plank': [{ sec: 30, done: true }, { sec: 30, done: true }] } } },
};

test('the upgrade’s settings, timetable changes and suggestions survive a sync', () => {
  for (const out of [mergeStates(newer, older), mergeStates(older, newer)]) {
    assert.equal(out.units, 'lb');
    assert.deepEqual(out.dayWindows, newer.dayWindows);
    const e = out.history[wk];
    assert.deepEqual(e.extra, newer.history[wk].extra);
    assert.deepEqual(e.hidden, ['s1']);
    assert.deepEqual(e.windows, newer.history[wk].windows);
    assert.deepEqual(e.lighten, ['upperA']);
    assert.equal(e.plan[0].locked, true);
    assert.deepEqual(Object.keys(e.reports).sort(), ['0', '1'], 'what was said on both devices is kept');
    assert.deepEqual(e.dismissed.sort(), ['move:a', 'swap:b'], 'turned-down suggestions stay turned down');
    assert.deepEqual(e.done, ['upperA']);
  }
});

test('custom exercises merge, and a deleted one stays deleted', () => {
  const out = mergeStates(newer, older);
  assert.equal(out.customExercises.find((x) => x.id === 'u_1').deleted, true);
  assert.ok(out.customExercises.some((x) => x.id === 'u_2'));
});

test('timed, distance and effort-tapped sets merge set by set', () => {
  const out = mergeStates(newer, older);
  const plank = out.log[wk].upperA['x_plank'];
  assert.deepEqual(plank[0], { sec: 45, done: true, effort: 'fail' });
  assert.deepEqual(plank[1], { sec: 30, done: true }, 'the extra set from the other device is kept');
  assert.equal(out.log[wk].upperA['x_farmers-carry'][0].m, 40);
});

test('a full year of heavy training still fits the server’s size limit', () => {
  const MAX_BYTES = 1800000; // functions/api/sync.js
  const state = { ...newer, history: {}, log: {}, coach: { turns: [] } };
  const d = new Date(2025, 10, 3);
  for (let w = 0; w < 52; w++, d.setDate(d.getDate() + 7)) {
    const key = d.toISOString().slice(0, 10);
    state.history[key] = { done: ['a', 'b', 'c', 'd', 'e'], plan: ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({ key: k, name: `Session ${k}`, day: i, start: 960, end: 1020, notes: ['Rugby tomorrow'], exercises: Array.from({ length: 6 }, (_, j) => ({ move: `x_exercise-${j}`, name: `Exercise ${j}`, sets: 4, reps: '8–12' })) })), checkins: { 0: { sleep: 1, sore: 1, energy: 0, hours: 2, stress: 1 } } };
    state.log[key] = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((k) => [k, Object.fromEntries(Array.from({ length: 6 }, (_, j) => [`x_exercise-${j}`, Array.from({ length: 4 }, () => ({ kg: 62.5, reps: 10, done: true, effort: 'hard' }))]))]));
  }
  state.coach.turns = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(1500) }));
  const size = Buffer.byteLength(JSON.stringify({ data: forUpload(state), baseUpdatedAt: 1 }));
  assert.ok(size < MAX_BYTES / 2, `${size} bytes: a year should use well under half`);
});
