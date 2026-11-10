import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeChanges, applyProposal } from '../js/adjust.js';

// Tuesday (1) at 9am. Lower A today 4pm, Upper A Thursday 4pm. Legs tired today, upper body fresh.
const S = () => [
  { key: 'lowerA', name: 'Lower A', day: 1, start: 960, end: 1020 },
  { key: 'upperA', name: 'Upper A', day: 3, start: 960, end: 1020 },
];
const groups = { lowerA: ['quads', 'glutes', 'hamstrings'], upperA: ['chest', 'back', 'shoulders'] };
const base = (over = {}) => ({
  sessions: S(), todayIdx: 1, nowMin: 540, isDone: () => false, mainGroups: (s) => groups[s.key],
  freshAt: (day) => (day <= 1 ? { quads: 55, glutes: 60, hamstrings: 80, chest: 100, back: 100, shoulders: 100 } : { quads: 90, glutes: 92, hamstrings: 95, chest: 100, back: 100, shoulders: 100 }),
  labels: { quads: 'Quads', glutes: 'Glutes' }, readiness: null, report: null,
  freeSlot: () => ({ start: 960, end: 1080 }), ...over,
});

test('tired legs and fresh upper body: swap the sessions, with the reason and what moves', () => {
  const { proposals } = proposeChanges(base());
  assert.equal(proposals.length, 1);
  const p = proposals[0];
  assert.equal(p.kind, 'swap');
  assert.match(p.reason, /quads about 55% and glutes about 60% recovered/);
  assert.match(p.reason, /estimated/);
  assert.deepEqual(p.moves.map((m) => [m.key, m.to.day]), [['upperA', 1], ['lowerA', 3]]);
});

test('nothing tired, nothing suggested (no unnecessary changes)', () => {
  const { proposals } = proposeChanges(base({ freshAt: () => ({ quads: 95, glutes: 95, hamstrings: 95, chest: 100, back: 100, shoulders: 100 }) }));
  assert.deepEqual(proposals, []);
});

test('locked workouts are never moved', () => {
  const sessions = S(); sessions[0].locked = true;
  const { proposals, notes } = proposeChanges(base({ sessions }));
  assert.deepEqual(proposals, []);
  assert.match(notes[0], /Lower A is locked/);
  const s2 = S(); s2[1].locked = true;
  const r = proposeChanges(base({ sessions: s2 }));
  assert.notEqual(r.proposals[0].kind, 'swap', 'a locked partner is not swapped either');
});

test('when no swap fits, move to a later free day', () => {
  const sessions = [S()[0]];
  const { proposals } = proposeChanges(base({ sessions }));
  assert.equal(proposals[0].kind, 'move');
  assert.equal(proposals[0].moves[0].to.day, 2);
});

test('fixed commitments: a day with no free time is never used', () => {
  const sessions = [S()[0]];
  const { proposals } = proposeChanges(base({ sessions, freeSlot: (d) => (d === 2 ? null : { start: 1000, end: 1100 }) }));
  assert.equal(proposals[0].moves[0].to.day, 3);
  assert.equal(proposals[0].moves[0].to.start, 1000);
});

test('no better day left: keep it but lighter', () => {
  const sessions = [S()[0]];
  const { proposals } = proposeChanges(base({ sessions, freeSlot: () => null }));
  assert.equal(proposals[0].kind, 'lighten');
  const out = applyProposal(sessions, proposals[0]);
  assert.deepEqual(out.lightened, ['lowerA']);
});

test('a rough check-in suggests resting today even when muscles are fine', () => {
  const fresh = () => ({ quads: 100, glutes: 100, hamstrings: 100, chest: 100, back: 100, shoulders: 100 });
  const { proposals } = proposeChanges(base({ freshAt: fresh, readiness: { level: 'rough', reasons: ['bad sleep', 'low energy'] }, sessions: [S()[0]] }));
  assert.equal(proposals[0].kind, 'rest');
  assert.match(proposals[0].reason, /bad sleep and low energy/);
});

test('what they said counts: sore legs today, and “legs are recovered” overrides the estimate', () => {
  const fresh = () => ({ quads: 100, glutes: 100, hamstrings: 100, chest: 100, back: 100, shoulders: 100 });
  const sore = proposeChanges(base({ freshAt: fresh, report: { sore: ['quads'], tired: false } }));
  assert.equal(sore.proposals.length, 1);
  assert.match(sore.proposals[0].reason, /what you said today/);
  const fine = proposeChanges(base({ report: { sore: [], fresh: ['quads', 'glutes'], tired: false } }));
  assert.deepEqual(fine.proposals, []);
});

test('dismissed suggestions stay dismissed', () => {
  const first = proposeChanges(base()).proposals[0];
  const again = proposeChanges(base({ dismissed: [first.id] }));
  assert.ok(!again.proposals.some((p) => p.id === first.id));
});

test('applying a swap pins both sessions in their new places', () => {
  const p = proposeChanges(base()).proposals[0];
  const { plan } = applyProposal(S(), p);
  assert.deepEqual(plan.map((s) => [s.key, s.day, s.pinned]), [['upperA', 1, true], ['lowerA', 3, true]]);
});

test('tiredness they typed is described as what they said, not as the check-in', () => {
  const fresh = () => ({ quads: 100, glutes: 100, hamstrings: 100, chest: 100, back: 100, shoulders: 100 });
  const { proposals } = proposeChanges(base({ freshAt: fresh, report: { sore: [], tired: true }, sessions: [S()[0]] }));
  assert.match(proposals[0].reason, /You said you’re very tired today/);
  assert.doesNotMatch(proposals[0].reason, /check-in/);
});
