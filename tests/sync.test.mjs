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
