import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStats, weekRange, consistency, missedSessions, sessionsSince, completedWorkouts,
  personalRecords, recentPRs, muscleSets, muscleWork, hoursUntilFresh, sessionDate,
} from '../js/stats.js';

const plan = (keys) => keys.map(([key, day, name]) => ({ key, day, name, start: 16 * 60, end: 17 * 60 }));
const data = {
  history: {
    '2026-10-19': { done: ['upperA', 'lowerA', 'upperB', 'lowerB'], plan: plan([['upperA', 0, 'Upper A'], ['lowerA', 2, 'Lower A'], ['upperB', 3, 'Upper B'], ['lowerB', 6, 'Lower B']]) },
    '2026-10-26': { done: ['upperA', 'lowerA'], plan: plan([['upperA', 0, 'Upper A'], ['lowerA', 2, 'Lower A'], ['upperB', 3, 'Upper B'], ['lowerB', 6, 'Lower B']]) },
    '2026-11-02': {
      done: ['upperA', 'upperA'], plan: plan([['upperA', 0, 'Upper A'], ['lowerA', 2, 'Lower A'], ['upperB', 4, 'Upper B'], ['lowerB', 6, 'Lower B']]),
      times: { upperA: { start: Date.UTC(2026, 10, 2, 5), end: Date.UTC(2026, 10, 2, 6) } },
    },
  },
  log: {
    '2026-10-19': { lowerA: { squat: [{ kg: 60, reps: 8, done: true }, { kg: 60, reps: 8, done: true }] } },
    '2026-10-26': { lowerA: { squat: [{ kg: 65, reps: 8, done: true }, { kg: 70, reps: 5, done: false }] }, upperA: { horizontalPush: [{ kg: 40, reps: 10, done: true }] } },
    '2026-11-02': { upperA: { horizontalPush: [{ kg: 42.5, reps: 8, done: true }], verticalPull: [{ kg: '', reps: 8, done: true }] } },
  },
};
const opts = { targetFor: () => 4, sportCreditFor: () => 0 };

test('week stats count ticked sets and volume only', () => {
  const w = weekStats(data, '2026-10-26', opts);
  assert.equal(w.done, 2);
  assert.equal(w.sets, 2);
  assert.equal(w.volume, 65 * 8 + 40 * 10);
  assert.equal(w.met, false);
  assert.equal(weekStats(data, '2026-10-19', opts).met, true);
  assert.equal(weekStats(data, '2026-11-02', opts).done, 1, 'duplicate done keys count once');
  assert.equal(weekStats(data, '2026-11-02', opts).weightedSets, 1);
});

test('sport credit can complete a week, capped at one', () => {
  assert.equal(weekStats(data, '2026-10-26', { targetFor: () => 3, sportCreditFor: () => 5 }).met, true);
  assert.equal(weekStats(data, '2026-10-26', { targetFor: () => 4, sportCreditFor: () => 5 }).met, false);
});

test('week range starts at the first recorded week', () => {
  assert.deepEqual(weekRange(data, '2026-11-02'), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(weekRange(data, '2026-11-02', 2), ['2026-10-26', '2026-11-02']);
  assert.deepEqual(weekRange({ history: {}, log: {} }, '2026-11-02', 8), ['2026-11-02']);
});

test('consistency judges finished weeks only', () => {
  const c = consistency(data, '2026-11-02', 'all', opts);
  assert.equal(c.weeksJudged, 2);
  assert.equal(c.weeksMet, 1);
  assert.equal(c.completed, 4 + 2 + 1);
});

test('missed sessions are past planned sessions not done', () => {
  // Thursday 5 Nov, 7am: Mon done, Wed missed; last week 2 missed; week before none.
  assert.equal(missedSessions(data, ['2026-10-19', '2026-10-26', '2026-11-02'], '2026-11-02', 3, 7 * 60), 3);
});

test('sessions in the last 30 days', () => {
  assert.equal(sessionsSince(data, new Date(2026, 10, 5, 12), 30), 7);
  assert.equal(sessionsSince(data, new Date(2026, 10, 5, 12), 7), 1, 'only Monday 2 Nov is within 7 days');
});

test('completed workouts newest first with their ticked sets', () => {
  const list = completedWorkouts(data, (m) => m.toUpperCase());
  assert.equal(list.length, 7);
  assert.equal(list[0].name, 'Upper A');
  assert.equal(list[0].wk, '2026-11-02');
  assert.equal(list[0].sets, 2);
  assert.equal(list[0].minutes, 60);
  const lower = list.find((w) => w.wk === '2026-10-26' && w.key === 'lowerA');
  assert.deepEqual(lower.exercises, [{ move: 'squat', name: 'SQUAT', sets: [{ kg: 65, reps: 8 }] }]);
  assert.equal(list.find((w) => w.key === 'lowerB').sets, 0, 'marked done without logging');
});

test('records come from history only', () => {
  const prs = personalRecords(data);
  const squat = prs.find((p) => p.move === 'squat');
  assert.deepEqual(squat.best, { kg: 65, reps: 8 });
  assert.equal(squat.sessions, 2);
  assert.equal(recentPRs(data).length, 2);
});

test('muscle sets: main movers count fully, helpers in part', () => {
  const m = muscleSets(data, new Date(2026, 9, 26).getTime(), new Date(2026, 10, 9).getTime());
  assert.equal(m.chest, 2);
  assert.equal(m.triceps, 1);
  assert.equal(m.quads, 1);
  assert.equal(m.back, 1);
});

test('muscle work lists recent sessions that hit a muscle', () => {
  const w = muscleWork(data, 'chest', new Date(2026, 10, 5, 12), 14);
  assert.equal(w.length, 2);
  assert.ok(w[0].date > w[1].date);
  assert.equal(w[0].sets, 1);
});

test('hours until fresh walks the same model forward', () => {
  const start = new Date(2026, 10, 5, 12);
  const freshAt = (d) => 50 + (d - start) / 36e5;
  assert.equal(hoursUntilFresh(freshAt, start), 36);
  assert.equal(hoursUntilFresh(() => 90, start), 0);
  assert.equal(hoursUntilFresh(() => 10, start), null);
});

test('session dates use the plan day and start time', () => {
  const d = sessionDate('2026-11-02', { day: 3, start: 15 * 60 + 30 });
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 15);
  assert.equal(d.getMinutes(), 30);
});
