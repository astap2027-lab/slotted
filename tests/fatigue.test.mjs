import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFreshness, setLoad, partsFor, PARTS, EFFORT } from '../js/freshness.js';
import { readiness, extrasText, EXTRAS } from '../js/readiness.js';
import { partWork, partVolume } from '../js/stats.js';
import { keyToDate } from '../js/scheduler.js';
import { setMoveResolver } from '../js/exercises.js';

const wk = '2026-11-02';
const weekStart = (k) => keyToDate(k);
const at = (day, hour) => new Date(2026, 10, 2 + day, hour, 0, 0);
const history = { [wk]: { done: ['s1'], plan: [{ key: 's1', day: 1, start: 16 * 60, exercises: [] }] } };
const run = (moves, now = at(1, 18)) => computeFreshness({ log: { [wk]: { s1: moves } }, history, weekStart, now });
const part = (r, id) => r.detail.find((p) => p.id === id).fresh;
const group = (r, id) => r.muscles.find((m) => m.id === id).fresh;
const sets = (n, x) => Array.from({ length: n }, () => ({ done: true, ...x }));
setMoveResolver((m) => (m.startsWith('x_') ? m.slice(2).replace(/-/g, ' ') : m));

test('every detailed muscle in the brief has its own estimate', () => {
  const r = run({});
  assert.equal(r.detail.length, PARTS.length);
  for (const id of ['rectus_femoris', 'vastus_lat', 'biceps_femoris', 'semitendinosus', 'glute_med', 'soleus', 'tibialis', 'obliques', 'tri_long', 'delt_rear']) {
    assert.ok(r.detail.some((p) => p.id === id), id);
  }
});

test('quads and hamstrings recover independently', () => {
  const ext = run({ 'x_leg-extension': sets(4, { kg: 40, reps: 12 }) });
  assert.ok(group(ext, 'quads') < 75, `quads ${group(ext, 'quads')}`);
  assert.equal(group(ext, 'hamstrings'), 100);
  assert.equal(part(ext, 'biceps_femoris'), 100);
  const curl = run({ 'x_leg-curl': sets(4, { kg: 30, reps: 12 }) });
  assert.ok(group(curl, 'hamstrings') < 75);
  assert.equal(group(curl, 'quads'), 100);
});

test('compound exercises update their main and helper muscles, main ones most', () => {
  const r = run({ 'x_bench-press': sets(4, { kg: 60, reps: 8 }) });
  assert.ok(part(r, 'chest_mid') < part(r, 'chest_upper'), 'upper chest helps, so it is less tired');
  assert.ok(part(r, 'tri_long') < 100, 'triceps help');
  assert.ok(part(r, 'tri_long') > part(r, 'chest_mid'));
  assert.equal(part(r, 'vastus_lat'), 100);
});

test('the body-map group shows its most tired muscle', () => {
  const r = run({ 'x_bench-press': sets(4, { kg: 60, reps: 8 }) });
  const chest = r.detail.filter((p) => p.group === 'chest').map((p) => p.fresh);
  assert.equal(group(r, 'chest'), Math.min(...chest));
});

test('the effort tap changes how much a set counts; no tap is a normal hard set', () => {
  assert.equal(setLoad({ kg: 0, reps: 10 }, 'reps'), 1);
  assert.ok(setLoad({ effort: 'easy', reps: 10 }, 'reps') < 1);
  assert.ok(setLoad({ effort: 'fail', reps: 10 }, 'reps') > 1);
  const easy = run({ 'x_leg-extension': sets(4, { kg: 40, reps: 12, effort: 'easy' }) });
  const fail = run({ 'x_leg-extension': sets(4, { kg: 40, reps: 12, effort: 'fail' }) });
  assert.ok(group(fail, 'quads') < group(easy, 'quads'));
  assert.deepEqual(Object.keys(EFFORT), ['easy', 'hard', 'fail']);
});

test('lighter sets count for less than sets near your best', () => {
  assert.ok(setLoad({ kg: 40, reps: 8 }, 'weight_reps', 100) < setLoad({ kg: 90, reps: 5 }, 'weight_reps', 100));
  assert.equal(setLoad({ kg: 30, reps: 6 }, 'weight_reps', 100, true), 1, 'assistance weight is not intensity');
});

test('timed and distance sets scale with time and distance', () => {
  assert.ok(setLoad({ sec: 20 }, 'duration') < setLoad({ sec: 60 }, 'duration'));
  assert.ok(setLoad({ reps: 60 }, 'duration') > 1, 'older plank logs in reps still count as seconds');
  assert.ok(setLoad({ kg: 24, m: 20 }, 'weight_distance') < setLoad({ kg: 24, m: 60 }, 'weight_distance'));
});

test('a big recent week slows recovery', () => {
  const small = run({ 'x_leg-extension': sets(3, { kg: 40, reps: 12 }) }, at(3, 18));
  const h = { [wk]: { done: ['s0', 's1'], plan: [{ key: 's0', day: 0, start: 960 }, { key: 's1', day: 1, start: 960 }] } };
  const big = computeFreshness({ log: { [wk]: { s0: { 'x_leg-extension': sets(12, { kg: 40, reps: 12 }) }, s1: { 'x_leg-extension': sets(3, { kg: 40, reps: 12 }) } } }, history: h, weekStart, now: at(3, 18) });
  assert.ok(group(big, 'quads') < group(small, 'quads'));
  assert.ok(big.detail.find((p) => p.id === 'vastus_lat').volume > 12);
});

test('exercises outside the library spread over their group', () => {
  const p = partsFor('x_mystery', 'Mystery machine', 'shoulders');
  assert.equal(p.delt_front, 1); assert.equal(p.delt_side, 1); assert.equal(p.delt_rear, 1);
});

test('per-muscle history and volume', () => {
  const log = { [wk]: { s1: { 'x_bench-press': sets(3, { kg: 60, reps: 8 }), 'x_leg-curl': sets(2, { kg: 30, reps: 10 }) } } };
  const data = { history, log };
  const w = partWork(data, 'chest_upper', at(3, 12), 14);
  assert.equal(w.length, 1);
  assert.equal(w[0].role, 'secondary');
  assert.equal(partWork(data, 'chest_mid', at(3, 12))[0].role, 'primary');
  assert.equal(partVolume(data, 'chest_mid', at(-3, 0).getTime(), at(3, 12).getTime()), 3);
  assert.equal(partVolume(data, 'chest_upper', at(-3, 0).getTime(), at(3, 12).getTime()), 1.8);
  assert.equal(partWork(data, 'biceps_femoris', at(3, 12))[0].name, 'Lying leg curl', 'named from the library');
});

test('optional check-in answers only nudge the result', () => {
  const core = { sleep: 0, sore: 1, energy: 0 };
  assert.equal(readiness(core).level, 'good');
  assert.equal(readiness({ ...core, hours: 2, tired: 0, stress: 0, ready: 0 }).level, 'good', 'good extras change nothing');
  const r = readiness({ ...core, hours: 0, stress: 2 });
  assert.equal(r.level, 'easy');
  assert.deepEqual(r.reasons, ['under 6 hours of sleep', 'high stress']);
  assert.equal(readiness({ ...core, hours: 0, stress: 2, tired: 2, ready: 2 }).level, 'easy', 'bad extras alone never make a rough day');
  assert.equal(readiness({ sleep: 1, sore: 1, energy: 0, hours: 0, stress: 2, tired: 2, ready: 2 }).level, 'rough', 'but they add up');
  assert.equal(readiness({ sleep: 1, sore: 1, energy: 1, hours: 0 }).level, 'easy', 'one bad extra never turns an easy day rough');
  assert.equal(readiness({ sleep: 2, sore: 1, energy: 1, hours: 0, tired: 2 }).level, 'rough');
  assert.equal(readiness({ hours: 0, stress: 2 }), null, 'the three main answers are still needed');
  assert.equal(extrasText({ hours: 1, stress: 2 }), 'hours slept 6 to 7, stress high');
  assert.equal(EXTRAS.length, 4);
});

test('looking back in time ignores work from later days', () => {
  const log = { [wk]: { s1: { 'x_bench-press': sets(4, { kg: 60, reps: 8 }) } } };
  const before = computeFreshness({ log, history, weekStart, now: at(0, 20) });
  assert.equal(before.muscles.find((m) => m.id === 'chest').fresh, 100, 'Tuesday’s session does not count on Monday');
  const sameDay = computeFreshness({ log, history, weekStart, now: at(1, 9) });
  assert.ok(sameDay.muscles.find((m) => m.id === 'chest').fresh < 100, 'sets ticked before the planned start still count that day');
});
