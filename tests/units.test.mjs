import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromKg, toKg, unitLabel, barFor, platesFor, weightStep, warmupOptions, PLATES_LB } from '../js/units.js';
import { platesPerSide, warmupSets, PLATES } from '../js/workout.js';

test('kg is stored as typed and shown as stored', () => {
  assert.equal(toKg(62.5, 'kg'), 62.5);
  assert.equal(fromKg(62.5, 'kg'), 62.5);
  assert.equal(unitLabel('kg'), 'kg');
  assert.equal(unitLabel(undefined), 'kg', 'kg is the default');
});

test('pounds round-trip without drifting', () => {
  for (const lb of [5, 45, 95, 135, 137.5, 225, 315]) assert.equal(fromKg(toKg(lb, 'lb'), 'lb'), lb, `${lb} lb`);
  assert.equal(fromKg(100, 'lb'), 220.5);
  assert.equal(fromKg(20, 'lb'), 44.1);
  assert.equal(unitLabel('lb'), 'lb');
});

test('empty boxes stay empty', () => {
  assert.equal(fromKg('', 'lb'), '');
  assert.equal(toKg('', 'lb'), '');
  assert.equal(fromKg(undefined, 'kg'), '');
});

test('pound plates load on a 45 lb bar', () => {
  assert.equal(barFor('lb', 20), 45);
  assert.equal(barFor('lb', 15), 35);
  assert.equal(barFor('kg', 15), 15);
  assert.deepEqual(platesFor('lb', PLATES), PLATES_LB);
  assert.deepEqual(platesPerSide(135, barFor('lb'), platesFor('lb', PLATES)), [45]);
  assert.deepEqual(platesPerSide(185, 45, PLATES_LB), [45, 25]);
  assert.deepEqual(platesPerSide(45, 45, PLATES_LB), []);
  assert.equal(platesPerSide(137, 45, PLATES_LB), null);
});

test('warm-ups in pounds start from the 45 lb bar and use 5 lb steps', () => {
  const sets = warmupSets(225, warmupOptions('lb', 20, true));
  assert.equal(sets[0].kg, 45, 'empty bar first');
  for (const s of sets) assert.equal(s.kg % 5, 0, `${s.kg} is a 5 lb step`);
  assert.ok(sets.every((s) => s.kg < 225));
  assert.equal(sets.length, 4, 'heavy working weight gets the full ramp');
  // Kilograms are unchanged.
  assert.deepEqual(warmupSets(100, warmupOptions('kg', 20, true)), warmupSets(100, { bar: 20, step: 2.5, barbell: true }));
});

test('progression steps suit the unit and equipment', () => {
  assert.equal(weightStep('kg', 'gym'), 2.5);
  assert.equal(weightStep('kg', 'home'), 2);
  assert.equal(weightStep('lb', 'gym'), 5);
  assert.equal(weightStep('lb', 'bodyweight'), 0);
});
