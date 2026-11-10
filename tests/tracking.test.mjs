import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findExercise, setMoveResolver } from '../js/exercises.js';
import { moveName } from '../js/scheduler.js';
import { fieldsFor, weightLabel, normSet, newBest, bestText, suggestSet, setsText, chartValue, chartCaption, weightNeeded, typedWeight, weightSoFar } from '../js/tracking.js';
import { collectHistory, summarise } from '../js/progress.js';

const ex = (n) => findExercise(n);

test('set rows follow the tracking type', () => {
  assert.deepEqual(fieldsFor('weight_reps'), ['kg', 'reps']);
  assert.deepEqual(fieldsFor('reps'), ['reps']);
  assert.deepEqual(fieldsFor('duration'), ['sec']);
  assert.deepEqual(fieldsFor('weight_duration'), ['kg', 'sec']);
  assert.deepEqual(fieldsFor('distance_duration'), ['m', 'sec']);
  assert.deepEqual(fieldsFor('weight_distance'), ['kg', 'm']);
  assert.deepEqual(fieldsFor('nonsense'), ['kg', 'reps'], 'unknown falls back to weight and reps');
});

test('the weight label says what the number means', () => {
  assert.equal(weightLabel(ex('Bench press')), 'kg total');
  assert.equal(weightLabel(ex('Dumbbell curl')), 'kg each hand');
  assert.equal(weightLabel(ex('Assisted pull-up')), 'kg assistance');
  assert.equal(weightLabel(ex('Weighted plank'), 'lb'), 'lb added');
  assert.equal(weightLabel(null), 'kg');
});

test('older plank logs with seconds in reps still read as time', () => {
  assert.deepEqual(normSet({ reps: 45, done: true }, 'duration'), { kg: 0, reps: 0, sec: 45, m: 0 });
  assert.deepEqual(normSet({ sec: 50, reps: 3 }, 'duration'), { kg: 0, reps: 0, sec: 50, m: 0 });
  assert.equal(normSet({ kg: 60, reps: 8 }, 'weight_reps').reps, 8);
});

test('weight and reps suggestions keep the old progression rule', () => {
  const full = [{ kg: 60, reps: 12 }, { kg: 60, reps: 12 }, { kg: 60, reps: 12 }];
  const up = suggestSet('weight_reps', '8–12', full, { sets: 3, step: 2.5 });
  assert.equal(up.kg, 62.5); assert.equal(up.reps, 8); assert.equal(up.up, true); assert.equal(up.upText, 'Try 62.5 kg');
  const same = suggestSet('weight_reps', '8–12', [{ kg: 60, reps: 10 }], { sets: 3, step: 2.5 });
  assert.equal(same.kg, 60); assert.equal(same.reps, 10); assert.equal(same.up, false);
  const fresh = suggestSet('weight_reps', '8–12', null);
  assert.equal(fresh.kg, ''); assert.equal(fresh.reps, 8);
  const bw = suggestSet('reps', '6–10', [{ reps: 10 }, { reps: 10 }, { reps: 10 }], { sets: 3, step: 0 });
  assert.equal(bw.reps, 11); assert.equal(bw.upText, 'Try 11 reps');
  const lb = suggestSet('weight_reps', '5', [{ kg: 135, reps: 5 }, { kg: 135, reps: 5 }, { kg: 135, reps: 5 }], { sets: 3, step: 5, units: 'lb' });
  assert.equal(lb.upText, 'Try 140 lb');
});

test('timed suggestions start at the planned time and add 5 seconds once every set gets there', () => {
  assert.equal(suggestSet('duration', '30–45s', null).sec, 30);
  const held = suggestSet('duration', '30–45s', [{ sec: 40 }, { sec: 40 }, { sec: 40 }], { sets: 3 });
  assert.equal(held.sec, 45); assert.equal(held.up, true); assert.equal(held.upText, 'Try 45 s');
  const short = suggestSet('duration', '45s', [{ sec: 30 }, { sec: 45 }], { sets: 3 });
  assert.equal(short.sec, 45); assert.equal(short.up, false);
  const carry = suggestSet('weight_distance', '40m', [{ kg: 24, m: 30 }]);
  assert.equal(carry.kg, 24); assert.equal(carry.m, 30); assert.equal(carry.reps, '');
});

test('personal bests compare like with like', () => {
  const sec = (n) => ({ kg: 0, reps: 0, sec: n, m: 0 });
  assert.equal(newBest('duration', [sec(40)], sec(50)), 'sec');
  assert.equal(newBest('duration', [sec(60)], sec(50)), null);
  assert.equal(newBest('duration', [], sec(50)), null, 'the first time is not a record');
  const set = (kg, reps) => ({ kg, reps, sec: 0, m: 0 });
  assert.equal(newBest('weight_reps', [set(60, 8)], set(62.5, 5)), 'kg');
  assert.equal(newBest('weight_reps', [set(60, 8)], set(60, 10)), null, 'more reps at the same weight is not a heavier best');
  assert.equal(newBest('reps', [set(0, 8)], set(0, 10)), 'reps');
  assert.equal(bestText('sec', 'Plank', sec(75)), 'Longest yet: Plank, 1:15');
  assert.equal(bestText('kg', 'Squat', set(100, 5), 'lb'), 'New best: Squat, 220.5 lb');
  assert.equal(bestText('m', 'Sled push', { kg: 40, m: 30 }), 'Furthest yet: Sled push, 30 m');
});

test('sets are written out for their type and unit', () => {
  const n = (x, t) => normSet(x, t);
  assert.equal(setsText([n({ kg: 60, reps: 8 }, 'weight_reps'), n({ kg: 60, reps: 7 }, 'weight_reps')], 'weight_reps'), '60 kg × 8, 7');
  assert.equal(setsText([n({ kg: 60, reps: 8 }, 'weight_reps'), n({ kg: 65, reps: 5 }, 'weight_reps')], 'weight_reps'), '60×8, 65×5 kg');
  assert.equal(setsText([n({ reps: 10 }, 'reps')], 'reps'), '10 reps');
  assert.equal(setsText([n({ reps: 45 }, 'duration'), n({ sec: 70 }, 'duration')], 'duration'), '45 s, 1:10');
  assert.equal(setsText([n({ kg: 24, m: 40 }, 'weight_distance')], 'weight_distance', 'lb'), '52.9 lb × 40 m');
  assert.equal(setsText([n({ m: 200, sec: 45 }, 'distance_duration')], 'distance_duration'), '200 m in 45 s');
});

test('progress charts plot the right number for each type', () => {
  const log = {
    '2026-10-19': { s1: { core: [{ reps: 40, done: true }], 'x_assisted-pull-up': [{ kg: 30, reps: 6, done: true }] } },
    '2026-10-26': { s1: { core: [{ sec: 55, done: true }], 'x_assisted-pull-up': [{ kg: 20, reps: 8, done: true }] } },
  };
  setMoveResolver((m) => moveName(m, 'gym'));
  const all = collectHistory(log, {});
  const plank = all.core;
  assert.equal(plank[0].kind, 'sec');
  assert.equal(chartValue('sec', plank[1]), 55);
  assert.equal(chartCaption('sec'), 'Longest set, seconds');
  assert.equal(plank[1].pr, true);
  const sum = summarise(plank);
  assert.equal(sum.kind, 'sec'); assert.equal(sum.change, 15);
  const assisted = all['x_assisted-pull-up'];
  assert.equal(assisted[0].kind, 'reps', 'assisted work is judged on reps, not assistance');
  assert.equal(assisted[1].pr, true);
  assert.equal(summarise(assisted).bestE1rm, null);
});

test('weighted exercises ask for a weight, bodyweight ones do not', () => {
  const need = (n) => { const e = ex(n); return weightNeeded(e.track || 'weight_reps', e.load); };
  assert.equal(weightNeeded('weight_reps', 'total'), true, 'barbell');
  assert.equal(weightNeeded('weight_reps', 'pair'), true, 'dumbbells');
  assert.equal(need('EZ-bar curl'), true, 'the EZ-bar curl asks for its weight');
  assert.equal(weightNeeded('weight_reps', 'added'), false, 'weighted pull-up: bodyweight is fine');
  assert.equal(weightNeeded('weight_reps', 'assisted'), false);
  assert.equal(weightNeeded('reps', 'none'), false, 'push-ups have no weight box');
  assert.equal(weightNeeded('duration', 'none'), false, 'plank has no weight box');
});

test('a typed weight: 0 is a real answer, empty and text are not', () => {
  assert.equal(typedWeight('0'), 0);
  assert.equal(typedWeight('20'), 20);
  assert.equal(typedWeight('22.5'), 22.5);
  assert.equal(typedWeight(''), '');
  assert.equal(typedWeight('kg'), '', 'a unit label placeholder is not a weight');
  assert.equal(typedWeight(undefined), '');
});

test('later sets start from the weight already used today', () => {
  assert.equal(weightSoFar([]), '');
  assert.equal(weightSoFar([{ reps: 10 }]), '', 'a set with no weight does not count');
  assert.equal(weightSoFar([{ reps: 10 }, { kg: 20, reps: 10 }, { kg: 25 }]), 20);
  assert.equal(weightSoFar([{ kg: 0, reps: 10 }]), 0, '0 is a weight someone chose');
  assert.equal(weightSoFar(undefined), '');
});
