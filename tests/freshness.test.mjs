import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFreshness, musclesFor, activityLoad, freshnessLevel } from '../js/freshness.js';
import { keyToDate } from '../js/scheduler.js';

const wk = '2026-11-02';
const weekStart = (k) => keyToDate(k);
const at = (day, hour) => new Date(2026, 10, 2 + day, hour, 0, 0);
const byId = (r) => Object.fromEntries(r.muscles.map((m) => [m.id, m.fresh]));

const history = { [wk]: { done: ['lowerA'], plan: [{ key: 'lowerA', day: 1, start: 16 * 60, exercises: [] }] } };
const log = { [wk]: { lowerA: { squat: Array(4).fill({ kg: 60, reps: 8, done: true }), hinge: Array(3).fill({ kg: 70, reps: 8, done: true }), calves: [{ kg: 0, reps: 12, done: false }] } } };

test('a heavy leg day leaves legs worked and the upper body fresh', () => {
  const r = computeFreshness({ log, history, weekStart, now: at(1, 18) });
  const f = byId(r);
  assert.ok(f.glutes < 60 && f.quads < 75 && f.hamstrings < 85, JSON.stringify(f));
  assert.equal(f.chest, 100);
  assert.ok(f.calves >= 85, 'unticked calf raises do not count; squats only steady the calves a little');
  assert.equal(r.sets, 7);
});

test('muscles recover over the following days', () => {
  const day1 = byId(computeFreshness({ log, history, weekStart, now: at(2, 16) }));
  const day3 = byId(computeFreshness({ log, history, weekStart, now: at(4, 16) }));
  assert.ok(day3.glutes > day1.glutes);
  assert.ok(day3.glutes >= 80, `glutes ${day3.glutes}`);
  const later = byId(computeFreshness({ log, history, weekStart, now: at(10, 16) }));
  assert.equal(later.glutes, 100, 'older than a week no longer counts');
});

test('a session marked done without logging counts its planned sets', () => {
  const h = { [wk]: { done: ['upperA'], plan: [{ key: 'upperA', day: 2, start: 960, exercises: [{ move: 'horizontalPush', name: 'Bench press', sets: 4 }, { move: 'verticalPull', name: 'Lat pulldown', sets: 4 }] }] } };
  const f = byId(computeFreshness({ log: {}, history: h, weekStart, now: at(2, 18) }));
  assert.ok(f.chest < 80 && f.back < 80);
  assert.equal(f.quads, 100);
});

test('your own exercises are matched by name, then by the muscle you picked', () => {
  assert.deepEqual(musclesFor('x_leg-curl', 'Leg curl', 'legs'), { hamstrings: 1, calves: 0.4 }, 'from the exercise library: hamstrings, with the calves helping');
  assert.equal(musclesFor('x_goblet', 'Goblet squat', 'legs').quads, 1);
  assert.equal(musclesFor('x_skull', 'Skull crusher', 'arms').triceps, 1);
  assert.equal(musclesFor('x_mystery', 'Mystery machine', 'shoulders').shoulders, 1);
});

test('Strava runs and games tire the legs; gym workouts are not double counted', () => {
  assert.ok(activityLoad({ type: 'Run', minutes: 40 }).sets > 0);
  assert.ok(activityLoad({ type: 'Basketball', minutes: 90, hard: true }).muscles.calves);
  assert.equal(activityLoad({ type: 'WeightTraining', minutes: 60 }).sets, 0);
  const f = byId(computeFreshness({ history: {}, weekStart, activities: [{ type: 'Basketball', minutes: 90, hard: true, date: '2026-11-07', start: '09:00' }], now: at(5, 12) }));
  assert.ok(f.calves < 60 && f.chest === 100);
});

test('no data means everything fresh and nothing to show', () => {
  const r = computeFreshness({ history: {}, weekStart, now: at(0, 9) });
  assert.equal(r.hasData, false);
  assert.ok(r.muscles.every((m) => m.fresh === 100));
});

test('levels', () => {
  assert.deepEqual([100, 85, 70, 50, 10].map(freshnessLevel), [0, 0, 1, 2, 3]);
});

test('the set and session counts only include the last 7 days', () => {
  const r = computeFreshness({ log, history, weekStart, now: at(10, 16) });
  assert.equal(r.sets, 0);
  assert.equal(r.sessions, 0);
  assert.equal(r.hasData, false, 'nothing recent, so nothing to estimate');
  const old = computeFreshness({ history: {}, weekStart, activities: [{ type: 'Run', minutes: 40, date: '2026-10-20', start: '07:00' }], now: at(3, 12) });
  assert.equal(old.activities, 0);
});
