import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineFromCopy, matchExercise, ROUTINE_SCHEMA } from '../js/routine-import.js';
import { onRequestPost } from '../functions/api/routine.js';

const copy = {
  workouts: [
    { name: 'Push', exercises: [
      { name: 'Barbell Bench Press', sets: 4, reps: '6-8', weight: 60, unit: 'kg' },
      { name: 'Incline DB Press', sets: 3, reps: '8 - 10 reps', weight: 22.5, unit: 'kg' },
      { name: 'Cable Lateral Raise', sets: 3, reps: '12-15', weight: 0, unit: 'none' },
    ] },
    { name: 'Legs', exercises: [
      { name: 'Back Squat', sets: 5, reps: '5', weight: 225, unit: 'lb' },
      { name: 'Plank', sets: 3, reps: '45 s', weight: 0, unit: 'none' },
      { name: 'Zercher carry thing', sets: 0, reps: '', weight: 0, unit: 'none' },
    ] },
    { name: 'Push', exercises: [{ name: 'Barbell Bench Press', sets: 4, reps: '6-8', weight: 60, unit: 'kg' }, { name: 'Tricep Pushdown', sets: 3, reps: '10,8,6', weight: 25, unit: 'kg' }] },
    { name: 'Empty', exercises: [] },
  ],
  unreadable: ['Screenshot 3, last row'],
};

test('names from other apps match the library, including short forms', () => {
  assert.equal(matchExercise('Barbell Bench Press').ex.name, 'Bench press');
  assert.ok(matchExercise('DB curl'), 'DB curl matches a dumbbell curl');
  assert.equal(matchExercise('Totally made up move'), null);
});

test('a copied routine becomes Slotted workouts: matched names, sets, reps, start weights, merged screenshots', () => {
  const r = routineFromCopy(copy, { units: 'kg', groupOf: (ex) => ex.category || 'legs' });
  assert.deepEqual(r.workouts.map((w) => w.name), ['Push', 'Legs'], 'the second Push screenshot joins the first; empty workouts are dropped');
  const push = r.workouts[0].exercises;
  assert.equal(push[0].name, 'Bench press'); assert.equal(push[0].sets, 4); assert.equal(push[0].reps, '6–8'); assert.equal(push[0].startKg, 60);
  assert.equal(push[1].reps, '8–10'); assert.equal(push[1].startKg, 22.5);
  assert.equal(push[2].startKg, undefined, 'no weight means none');
  assert.equal(push.length, 4, 'the repeated bench press is not added twice');
  assert.equal(push[3].reps, '10, 8, 6');
  const legs = r.workouts[1].exercises;
  assert.equal(legs[0].startKg, 102.06, '225 lb in kg');
  assert.equal(legs[1].reps, '45s');
  assert.equal(legs[2].name, 'Zercher carry thing'); assert.equal(legs[2].known, false); assert.equal(legs[2].sets, 3, 'missing sets default to 3'); assert.equal(legs[2].reps, '8–12');
  assert.deepEqual(r.unmatched, ['Zercher carry thing']);
  assert.deepEqual(r.notes, ['Screenshot 3, last row']);
  assert.deepEqual(routineFromCopy(null).workouts, []);
});

test('the copy schema is strict', () => {
  assert.equal(ROUTINE_SCHEMA.additionalProperties, false);
  assert.deepEqual(ROUTINE_SCHEMA.properties.workouts.items.properties.exercises.items.required, ['name', 'sets', 'reps', 'weight', 'unit']);
});

test('the routine endpoint uses the stronger model, falls back, times out, and refuses bad images', async () => {
  const req = (body) => new Request('https://slotted-ea5.pages.dev/api/routine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const env = { ANTHROPIC_API_KEY: 'k' };
  assert.equal((await onRequestPost({ request: req({ text: 'x' }), env: {} })).status, 503);
  const calls = [];
  const tool = { content: [{ type: 'tool_use', name: 'routine_copy', input: copy }] };
  globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); calls.push(b); return new Response(JSON.stringify(b.model === 'claude-sonnet-5-5' ? { content: [{ type: 'text', text: 'hmm' }] } : tool)); };
  const out = await (await onRequestPost({ request: req({ images: [{ media_type: 'image/png', data: 'QUJD' }] }), env })).json();
  assert.equal(out.copy.workouts.length, 4);
  assert.deepEqual(calls.map((c) => c.model), ['claude-sonnet-5-5', 'claude-haiku-5-5']);
  assert.deepEqual(calls[0].tool_choice, { type: 'auto' }); assert.equal(calls[0].thinking, undefined);
  assert.deepEqual(calls[1].tool_choice, { type: 'tool', name: 'routine_copy' });
  assert.equal(calls[0].messages[0].content[1].type, 'image');
  calls.length = 0;
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify(tool)); };
  await onRequestPost({ request: req({ text: 'Push: bench 4x8' }), env });
  assert.match(calls[0].messages[0].content.at(-1).text, /Pasted text:\nPush: bench 4x8/);
  globalThis.fetch = async () => { const e = new Error('slow'); e.name = 'TimeoutError'; throw e; };
  assert.equal((await onRequestPost({ request: req({ text: 'x' }), env })).status, 504);
  for (const bad of [[{ media_type: 'application/pdf', data: 'QUJD' }], Array.from({ length: 7 }, () => ({ media_type: 'image/png', data: 'QUJD' })), [{ media_type: 'image/png', data: 'bad data!' }]]) {
    assert.equal((await onRequestPost({ request: req({ images: bad }), env })).status, 400);
  }
  assert.equal((await onRequestPost({ request: req({}), env })).status, 400);
});
