import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWeek, setCustomRoutine, routineKeys, sessionInfo, exercisesFor, moveName, exerciseKey, exerciseLibrary } from '../js/scheduler.js';

const win = { start: '06:00', end: '21:00' };
const school = [0, 1, 2, 3, 4].map((day) => ({ day, start: '08:30', end: '15:10', type: 'school', label: 'School' }));
const arnold = {
  mode: 'custom',
  workouts: [
    { id: 'cb', name: 'Chest and back', exercises: [{ name: 'Bench press', sets: 4, reps: '6–8', group: 'chest' }, { name: 'Barbell row', sets: 4, reps: '6–8', group: 'back' }] },
    { id: 'sa', name: 'Shoulders and arms', exercises: [{ name: 'Arnold press', sets: 4, reps: '8–10', group: 'shoulders' }, { name: 'Barbell curl', sets: 3, reps: '10', group: 'arms' }] },
    { id: 'lg', name: 'Legs', exercises: [{ name: 'Barbell back squat', sets: 4, reps: '5', group: 'legs' }, { name: 'Leg curl', sets: 3, reps: '10–12', group: 'legs' }, { name: 'Plank', sets: 3, reps: '45s', group: 'core' }] },
  ],
};
const profile = (n) => ({ goal: 'muscle', level: 'intermediate', equipment: 'gym', sessionsPerWeek: n, sessionLength: 60 });

test('custom workouts become sessions with their own exercises', () => {
  setCustomRoutine(arnold);
  assert.equal(sessionInfo('c_lg').legs, 'heavy');
  assert.equal(sessionInfo('c_cb').legs, 'none');
  assert.deepEqual(sessionInfo('c_cb').groups, ['chest', 'back']);
  const ex = exercisesFor('c_lg', profile(3));
  assert.deepEqual(ex.map((e) => e.name), ['Barbell back squat', 'Leg curl', 'Plank']);
  assert.equal(ex[0].sets, 4);
  assert.equal(moveName(exerciseKey('Leg curl'), 'gym'), 'Leg curl');
});

test('rotation runs in order and continues next week', () => {
  setCustomRoutine(arnold);
  assert.deepEqual(routineKeys(profile(6), arnold, 0), ['c_cb', 'c_sa', 'c_lg', 'c_cb#2', 'c_sa#2', 'c_lg#2']);
  assert.deepEqual(routineKeys(profile(4), arnold, 0), ['c_cb', 'c_sa', 'c_lg', 'c_cb#2']);
  assert.deepEqual(routineKeys(profile(4), arnold, 1), ['c_sa', 'c_lg', 'c_cb', 'c_sa#2']);
  assert.equal(sessionInfo('c_cb#2').name, 'Chest and back');
});

test('keep order places workouts in sequence through the week', () => {
  setCustomRoutine(arnold);
  const keys = routineKeys(profile(6), arnold, 0);
  const plan = planWeek(profile(6), school, win, { keys, keepOrder: true });
  assert.equal(plan.sessions.length, 6);
  assert.deepEqual(plan.sessions.map((s) => s.key), keys);
});

test('custom leg day still avoids a game and the day before', () => {
  setCustomRoutine(arnold);
  const blocks = [...school, { day: 5, start: '09:00', end: '11:00', type: 'sport', intensity: 'hard', label: 'Game' }];
  const keys = routineKeys(profile(3), arnold, 0);
  const plan = planWeek(profile(3), blocks, win, { keys, keepOrder: true });
  const legDay = plan.sessions.find((s) => s.key === 'c_lg').day;
  assert.ok(![4, 5].includes(legDay), `legs on ${legDay}`);
});

test('dropped custom workout folds its first exercises into another', () => {
  setCustomRoutine(arnold);
  const re = planWeek(profile(3), school, win, { keys: ['c_cb', 'c_sa'], fromDay: 6, keepOrder: true });
  assert.equal(re.sessions.length, 1);
  assert.ok(re.sessions[0].exercises.some((x) => x.from));
});

test('library offers known exercises with muscle groups', () => {
  const lib = exerciseLibrary();
  assert.ok(lib.find((e) => e.name === 'Bench press' && e.group === 'chest'));
  assert.ok(lib.find((e) => e.name === 'Arnold press' && e.group === 'shoulders'));
  assert.equal(new Set(lib.map((e) => e.name)).size, lib.length);
});
