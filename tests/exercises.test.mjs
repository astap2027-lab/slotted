import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN, MUSCLE_INFO, findExercise, searchExercises, alternativesFor, validateExercise, setCustomExercises,
  similarExercises, suggestMapping, muscleWeights, groupWeights, volumeOf, secOf, targetOf, exNorm, equipmentFits,
} from '../js/exercises.js';

test('every built-in exercise is a valid record with a unique id', () => {
  const ids = new Set();
  for (const ex of BUILT_IN) {
    assert.deepEqual(validateExercise(ex), [], `${ex.id}: ${validateExercise(ex).join(' ')}`);
    assert.ok(!ids.has(ex.id), `duplicate id ${ex.id}`);
    ids.add(ex.id);
    assert.ok(ex.cue && ex.cue.length > 10, `${ex.id} has instructions`);
  }
  assert.ok(BUILT_IN.length >= 200, `library has ${BUILT_IN.length} exercises`);
});

test('every muscle in the brief is tracked and used by at least one exercise', () => {
  const used = new Set(BUILT_IN.flatMap((e) => Object.keys(muscleWeights(e))));
  for (const id of Object.keys(MUSCLE_INFO)) assert.ok(used.has(id), `${id} is never trained`);
});

test('every exercise name Slotted has used before still resolves', () => {
  const old = ['Barbell back squat', 'Romanian deadlift', 'Walking lunge', 'Hip thrust', 'Standing calf raise', 'Bench press', 'Incline dumbbell press',
    'Overhead press', 'Seated cable row', 'Lat pulldown', 'Lateral raise', 'Face pull', 'Dumbbell curl', 'Triceps pushdown', 'Plank', 'Goblet squat',
    'Dumbbell Romanian deadlift', 'Bulgarian split squat', 'Dumbbell hip thrust', 'Single-leg calf raise', 'Dumbbell bench press', 'Dumbbell shoulder press',
    'One-arm dumbbell row', 'Pull-up', 'Rear delt fly', 'Overhead triceps extension', 'Bodyweight squat', 'Single-leg hip hinge', 'Reverse lunge',
    'Glute bridge', 'Calf raise', 'Push-up', 'Decline push-up', 'Pike push-up', 'Table row', 'Pull-up or towel row', 'Wall handstand hold', 'Prone Y raise',
    'Chin-up hold', 'Bench dip', 'Deadlift', 'Leg press', 'Leg curl', 'Leg extension', 'Front squat', 'Chest fly', 'Dips', 'Cable crossover', 'Barbell row',
    'Chin-up', 'Shrug', 'T-bar row', 'Arnold press', 'Upright row', 'Hammer curl', 'Barbell curl', 'Skull crusher', 'Close-grip bench press',
    'Hanging leg raise', 'Cable crunch', 'Ab wheel rollout'];
  for (const n of old) assert.ok(findExercise(n), `${n} not found`);
  assert.equal(findExercise('x_incline-dumbbell-press').id, 'incline-dumbbell-press', 'stored exercise keys resolve too');
});

test('common names, plurals and abbreviations are recognised', () => {
  assert.equal(findExercise('RDL').id, 'romanian-deadlift');
  assert.equal(findExercise('ohp').id, 'overhead-press');
  assert.equal(findExercise('DB bench press').id, 'dumbbell-bench-press');
  assert.equal(findExercise('push ups').id, 'push-up');
  assert.equal(findExercise('Farmers walk').id, 'farmers-carry');
  assert.equal(findExercise('skullcrushers').id, 'skull-crusher');
  assert.equal(exNorm('Triceps Push-downs'), exNorm('tricep push-down'));
  assert.equal(findExercise('something made up'), null);
});

test('search finds by name, muscle and equipment, with filters', () => {
  assert.equal(searchExercises('bench')[0].id, 'bench-press');
  const hams = searchExercises('', { group: 'hamstrings', role: 'primary' });
  assert.ok(hams.some((e) => e.id === 'lying-leg-curl') && hams.every((e) => Object.keys(e.muscles.primary).some((m) => MUSCLE_INFO[m].group === 'hamstrings')));
  assert.ok(searchExercises('', { equipment: 'band' }).every((e) => e.equipment === 'band'));
  assert.ok(searchExercises('', { type: 'Timed' }).some((e) => e.id === 'plank'));
  assert.ok(searchExercises('', { muscle: 'delt_side' }).some((e) => e.id === 'lateral-raise'));
  assert.ok(searchExercises('', { mechanics: 'isolation', category: 'quads' }).some((e) => e.id === 'leg-extension'));
  assert.ok(searchExercises('lats').some((e) => e.id === 'lat-pulldown'), 'muscle names are searchable');
});

test('muscle mappings match the brief and roll up correctly', () => {
  const bench = findExercise('Bench press');
  assert.ok(bench.muscles.primary.chest_mid && bench.muscles.secondary.tri_long && bench.muscles.secondary.delt_front);
  assert.ok(findExercise('Lateral raise').muscles.primary.delt_side);
  const rdl = findExercise('Romanian deadlift');
  assert.ok(rdl.muscles.primary.biceps_femoris && rdl.muscles.primary.glute_max && rdl.muscles.secondary.erectors);
  assert.deepEqual(Object.keys(groupWeights(findExercise('Leg extension'))), ['quads']);
  assert.deepEqual(Object.keys(groupWeights(findExercise('Lying leg curl'))).sort(), ['calves', 'hamstrings']);
  const w = muscleWeights(bench);
  assert.ok(w.chest_mid > w.tri_long && w.tri_long > w.lats, 'primary > secondary > stabiliser');
});

test('alternatives train the same main muscles with kit you have', () => {
  const alts = alternativesFor(findExercise('Bench press'), { fits: 'home' });
  assert.ok(alts.length >= 3);
  assert.ok(alts.every((a) => equipmentFits(a, 'home')));
  assert.ok(alts.every((a) => Object.keys(a.muscles.primary).some((m) => MUSCLE_INFO[m].group === 'chest' || MUSCLE_INFO[m].group === 'triceps')));
  assert.equal(alts[0].pattern, 'Horizontal push');
  assert.ok(alternativesFor(findExercise('Lying leg curl'), { fits: 'bodyweight' }).some((a) => a.id === 'nordic-curl'));
});

test('custom exercises join the library and duplicates are caught', () => {
  const mine = { id: 'u_zercher', name: 'Zercher squat', aka: ['zercher'], equipment: 'barbell', category: 'quads', pattern: 'Squat', mechanics: 'compound',
    track: 'weight_reps', load: 'total', muscles: { primary: { vastus_lat: 1 }, secondary: { glute_max: 0.5 }, stabilisers: {} }, cue: 'Bar in the elbows.' };
  setCustomExercises([mine, { id: 'bad', name: '' }]);
  assert.equal(findExercise('zercher').id, 'u_zercher');
  assert.ok(searchExercises('zercher')[0].custom);
  assert.equal(similarExercises('Bench press')[0].id, 'bench-press');
  assert.ok(similarExercises('barbell bench press flat').some((e) => e.id === 'bench-press'));
  assert.equal(suggestMapping('Banded face pull').id, 'face-pull');
  assert.ok(validateExercise({ ...mine, muscles: { primary: {} } }).includes('Pick at least one main muscle.'));
  setCustomExercises([]);
  assert.equal(findExercise('zercher'), null);
});

test('volume counts pairs of dumbbells twice and leaves out timed work and assistance', () => {
  assert.equal(volumeOf({ kg: 100, reps: 5 }, findExercise('Bench press')), 500);
  assert.equal(volumeOf({ kg: 20, reps: 10 }, findExercise('Dumbbell bench press')), 400);
  assert.equal(volumeOf({ kg: 20, reps: 10 }, findExercise('One-arm dumbbell row')), 200);
  assert.equal(volumeOf({ kg: 30, reps: 8 }, findExercise('Assisted pull-up')), 0);
  assert.equal(volumeOf({ kg: 20, sec: 60 }, findExercise('Weighted plank')), 0);
  assert.equal(volumeOf({ kg: 10, reps: 5 }, null), 50);
});

test('timed sets read seconds, including older logs that stored them as reps', () => {
  assert.equal(secOf({ sec: 45 }, 'duration'), 45);
  assert.equal(secOf({ reps: 40 }, 'duration'), 40);
  assert.equal(secOf({ reps: 40 }, 'weight_reps'), 0);
  assert.deepEqual(targetOf('30–45s'), { sec: 30 });
  assert.deepEqual(targetOf('2 min'), { sec: 120 });
  assert.deepEqual(targetOf('8–12'), { reps: 8, high: 12 });
  assert.deepEqual(targetOf('40 m'), { m: 40 });
});
