import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readiness, adjustment, applyAdjustment, complete } from '../js/readiness.js';

const ex = [
  { move: 'a', sets: 4, reps: '5' }, { move: 'b', sets: 3, reps: '8' },
  { move: 'c', sets: 3, reps: '10' }, { move: 'd', sets: 2, reps: '12' },
];

test('incomplete check-ins change nothing', () => {
  assert.equal(complete({ sleep: 0, sore: 1 }), false);
  assert.equal(readiness({ sleep: 0 }), null);
  assert.equal(adjustment({ sleep: 2 }), null);
});

test('good day leaves the session alone', () => {
  const c = { sleep: 0, sore: 1, energy: 0 };
  assert.equal(readiness(c).level, 'good');
  assert.equal(adjustment(c), null);
});

test('flat day drops one set but never below two', () => {
  const c = { sleep: 1, sore: 1, energy: 0 };
  assert.equal(readiness(c).level, 'easy');
  const out = applyAdjustment(ex, adjustment(c));
  assert.deepEqual(out.map((x) => x.sets), [3, 2, 2, 2]);
});

test('very sore alone counts as rough', () => {
  assert.equal(readiness({ sleep: 0, sore: 2, energy: 0 }).level, 'rough');
});

test('rough day: no change until a choice, light keeps three exercises and goes lighter', () => {
  const c = { sleep: 2, sore: 1, energy: 2 };
  assert.equal(readiness(c).level, 'rough');
  assert.equal(adjustment(c), null);
  const adj = adjustment({ ...c, choice: 'light' });
  assert.equal(adj.kgFactor, 0.9);
  const out = applyAdjustment(ex, adj);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((x) => x.sets), [3, 2, 2]);
});
