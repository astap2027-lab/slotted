import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, importJSON } from '../js/store.js';
import { setCustomExercises, findExercise, BUILT_IN } from '../js/exercises.js';

test('new installs default to kilograms and no custom exercises', () => {
  const s = defaultState();
  assert.equal(s.units, 'kg');
  assert.deepEqual(s.customExercises, []);
});

test('an older backup without units or custom exercises still loads, with its data intact', () => {
  const old = { app: 'slotted', version: 1, profile: { goal: 'muscle', equipment: 'gym' }, log: { '2026-10-26': { s1: { core: [{ reps: 45, done: true }] } } } };
  const s = importJSON(JSON.stringify(old));
  assert.equal(s.units, 'kg');
  assert.deepEqual(s.customExercises, []);
  assert.deepEqual(s.log, old.log, 'logs untouched');
  const lb = importJSON(JSON.stringify({ ...old, units: 'lb' }));
  assert.equal(lb.units, 'lb');
});

test('deleted custom exercises leave the library but stay in saved data', () => {
  const mine = { ...BUILT_IN.find((e) => e.id === 'bench-press'), id: 'u_test1', name: 'Zercher wobble press', aka: [] };
  setCustomExercises([mine]);
  assert.equal(findExercise('Zercher wobble press').id, 'u_test1');
  setCustomExercises([{ ...mine, deleted: true }]);
  assert.equal(findExercise('Zercher wobble press'), null);
  setCustomExercises([]);
});
