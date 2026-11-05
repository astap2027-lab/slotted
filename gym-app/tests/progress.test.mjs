import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectHistory, summarise, e1rm } from '../js/progress.js';

const log = {
  '2026-10-19': { upperA: { horizontalPush: [{ kg: 20, reps: 10, done: true }, { kg: 20, reps: 9, done: true }, { kg: 22, reps: 4, done: false }] } },
  '2026-10-26': { upperA: { horizontalPush: [{ kg: 22, reps: 8, done: true }], pullup: [{ kg: '', reps: 6, done: true }] } },
  '2026-11-02': { upperB: { horizontalPush: [{ kg: 24, reps: 6, done: true }] } },
};
const history = {
  '2026-10-19': { plan: [{ key: 'upperA', day: 1 }] },
  '2026-10-26': { plan: [{ key: 'upperA', day: 3 }] },
};

test('e1rm uses Epley and ignores high-rep sets', () => {
  assert.equal(e1rm(100, 5), 116.5);
  assert.equal(e1rm(20, 20), null);
  assert.equal(e1rm(0, 8), null);
});

test('history ignores unticked sets and orders by date', () => {
  const h = collectHistory(log, history);
  const bench = h.horizontalPush;
  assert.equal(bench.length, 3);
  assert.equal(bench[0].sets.length, 2, 'the unticked 22 kg set is ignored');
  assert.equal(bench[0].date.getDate(), 20); // Tuesday of week 19 Oct
  assert.deepEqual(bench.map((s) => s.best.kg), [20, 22, 24]);
});

test('personal bests are flagged after the first session', () => {
  const bench = collectHistory(log, history).horizontalPush;
  assert.deepEqual(bench.map((s) => s.pr), [false, true, true]);
  const sum = summarise(bench);
  assert.equal(sum.prs, 2);
  assert.equal(sum.change, 4);
  assert.deepEqual(sum.best, { kg: 24, reps: 6 });
});

test('bodyweight exercises track reps instead of weight', () => {
  const sum = summarise(collectHistory(log, history).pullup);
  assert.equal(sum.weighted, false);
  assert.equal(sum.bestE1rm, null);
});
