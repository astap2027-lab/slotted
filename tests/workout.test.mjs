import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restSeconds, platesPerSide, warmupSets, usesBarbell, alternatives, needs, weekRecap } from '../js/workout.js';

test('rest is longer for big lifts and for strength goals', () => {
  assert.equal(restSeconds('strength', 'squat', 'Barbell back squat'), 180);
  assert.equal(restSeconds('muscle', 'lateral', 'Lateral raise'), 75);
  assert.equal(restSeconds('muscle', 'x_deadlift', 'Deadlift'), 120);
  assert.equal(restSeconds('fitness', 'biceps', 'Dumbbell curl'), 45);
});

test('plates per side, heaviest first', () => {
  assert.deepEqual(platesPerSide(100), [25, 15], 'fewest plates');
  assert.deepEqual(platesPerSide(62.5), [20, 1.25]);
  assert.deepEqual(platesPerSide(20), []);
  assert.deepEqual(platesPerSide(60, 15), [20, 2.5]);
  assert.equal(platesPerSide(61), null, '61 kg can’t be loaded exactly');
  assert.equal(platesPerSide(10), null, 'lighter than the bar');
});

test('which exercises use a barbell', () => {
  assert.ok(usesBarbell('Barbell back squat'));
  assert.ok(usesBarbell('Bench press'));
  assert.ok(!usesBarbell('Dumbbell bench press'));
  assert.ok(!usesBarbell('Goblet squat'));
});

test('warm-up ramps from the empty bar and stays below the working weight', () => {
  assert.deepEqual(warmupSets(100), [{ kg: 20, reps: 10 }, { kg: 50, reps: 5 }, { kg: 70, reps: 3 }, { kg: 85, reps: 1 }]);
  assert.deepEqual(warmupSets(40), [{ kg: 20, reps: 10 }, { kg: 25, reps: 5 }, { kg: 32.5, reps: 2 }]);
  assert.deepEqual(warmupSets(24, { barbell: false, step: 2 }), [{ kg: 12, reps: 10 }]);
  assert.deepEqual(warmupSets(0), []);
});

test('swaps work the same muscles and fit the equipment', () => {
  const bench = alternatives('Bench press', 'horizontalPush', 'gym');
  assert.ok(bench.length >= 3);
  assert.ok(bench.every((e) => ['chest'].includes(e.group) || /press|push|fly|dip/i.test(e.name)), JSON.stringify(bench));
  assert.match(bench[0].name, /press/i, 'a press swaps to another press first');
  const home = alternatives('Bench press', 'horizontalPush', 'home');
  assert.ok(home.every((e) => needs(e.name) !== 'gym'), JSON.stringify(home));
  const bw = alternatives('Barbell back squat', 'squat', 'bodyweight');
  assert.ok(bw.length && bw.every((e) => needs(e.name) === 'bodyweight'), JSON.stringify(bw));
  assert.ok(!alternatives('Bench press', 'horizontalPush', 'gym', ['Incline dumbbell press']).some((e) => e.name === 'Incline dumbbell press'));
});

test('the recap summarises last week', () => {
  const history = {
    '2026-10-26': { done: ['upperA', 'lowerA', 'upperB'], plan: [{ key: 'upperA', day: 0 }, { key: 'lowerA', day: 2 }, { key: 'upperB', day: 4 }, { key: 'lowerB', day: 6 }] },
    '2026-10-19': { done: ['lowerA'], plan: [{ key: 'lowerA', day: 2 }] },
  };
  const log = {
    '2026-10-19': { lowerA: { squat: [{ kg: 60, reps: 8, done: true }] } },
    '2026-10-26': { lowerA: { squat: [{ kg: 65, reps: 8, done: true }, { kg: 65, reps: 7, done: true }] } },
  };
  const r = weekRecap({ history, log, prevKey: '2026-10-26', targetFor: () => 4, sportCreditFor: () => 1, nameOf: () => 'Squat' });
  assert.equal(r.done, 3);
  assert.equal(r.met, true, 'one sport session tops it up to 4');
  assert.equal(r.sets, 2);
  assert.deepEqual(r.prs, [{ move: 'squat', name: 'Squat', kg: 65, reps: 8, sec: 0, m: 0 }]);
  const empty = weekRecap({ history, log, prevKey: '2026-10-12', targetFor: () => 4 });
  assert.equal(empty.hadWeek, false);
});
