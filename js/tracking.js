// How each exercise is logged, according to its tracking type: which boxes a set row has,
// what the weight box means, what to pre-fill, what counts as a personal best, and how to write sets out.
// Weights given to these functions are already in the user's unit (see units.js) unless noted.
import { TRACKS, secOf, targetOf } from './exercises.js';
import { unitLabel, fromKg } from './units.js';
import { kindOf } from './progress.js';

export const fieldsFor = (track) => (TRACKS[track] || TRACKS.weight_reps).fields;
export const hasWeight = (track) => fieldsFor(track).includes('kg');
export const isTimed = (track) => fieldsFor(track).includes('sec');

// What the weight box means, short enough for a column heading.
const LOAD_WORDS = { total: 'total', pair: 'each hand', single: '', added: 'added', assisted: 'assistance', none: '' };
export function weightLabel(ex, units = 'kg') {
  const words = ex ? LOAD_WORDS[ex.load] : '';
  return words ? `${unitLabel(units)} ${words}` : unitLabel(units);
}
export const FIELD_LABEL = { reps: 'Reps', sec: 'Seconds', m: 'Metres' };

// One logged set as numbers, whatever its age. Older timed logs kept seconds in "reps".
export function normSet(x, track) {
  const timed = track === 'duration' || track === 'weight_duration';
  return {
    kg: Number(x && x.kg) || 0,
    reps: timed ? 0 : Number(x && x.reps) || 0,
    sec: secOf(x, track),
    m: Number(x && x.m) || 0,
  };
}

// The number that should go up for a kind of progress.
export const metricOf = (kind, s) => (kind === 'kg' ? s.kg : kind === 'sec' ? s.sec : kind === 'm' ? s.m : s.reps);

// Does this set beat everything logged before? Only compares like with like (one kind per exercise).
// prev and set are normalised sets (normSet). Returns the kind it improved on, or null.
export function newBest(track, prev, set) {
  if (!prev.length) return null;
  const kind = kindOf(track, [...prev, set]);
  const before = Math.max(0, ...prev.map((s) => metricOf(kind, s)));
  return before > 0 && metricOf(kind, set) > before ? kind : null;
}

export const fmtDuration = (sec) => {
  const n = Math.round(Number(sec) || 0);
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

// The personal-best message, worded for what improved.
export function bestText(kind, name, s, units = 'kg') {
  if (kind === 'kg') return `New best: ${name}, ${fromKg(s.kg, units)} ${unitLabel(units)}`;
  if (kind === 'sec') return `Longest yet: ${name}, ${fmtDuration(s.sec)}`;
  if (kind === 'm') return `Furthest yet: ${name}, ${s.m} m`;
  return `Most reps yet: ${name}, ${s.reps}`;
}

const repLimits = (reps) => {
  const nums = String(reps || '').match(/\d+/g) || ['8'];
  return { low: Number(nums[0]), high: Number(nums[nums.length - 1]) };
};

// What to pre-fill for this time, from last time (normalised sets with kg already in the user's unit).
// Weight and reps: same weight, or a step up once every set hit the top of the range.
// Timed: the planned time, or 5 seconds more once every set reached it. Distance: last distance.
export function suggestSet(track, prescription, last, { sets = 3, step = 2.5, units = 'kg' } = {}) {
  const f = fieldsFor(track);
  const out = { kg: '', reps: '', sec: '', m: '', up: false, upText: '' };
  const want = targetOf(prescription);
  const topKg = last && last.length ? Math.max(...last.map((s) => s.kg || 0)) : 0;
  if (f.includes('kg')) out.kg = topKg || '';
  if (f.includes('reps')) {
    const { low, high } = repLimits(prescription);
    out.reps = low;
    if (last && last.length) {
      const allTop = last.length >= sets && last.every((s) => (s.reps || 0) >= high);
      if (allTop && f.includes('kg') && topKg > 0 && step) Object.assign(out, { kg: Math.round((topKg + step) * 100) / 100, reps: low, up: true });
      else if (allTop) Object.assign(out, { reps: high + 1, up: true });
      else out.reps = Math.max(low, ...last.map((s) => s.reps || 0));
    }
  }
  if (f.includes('sec') && !f.includes('m')) {
    const goal = want.sec || 30;
    const topSec = last && last.length ? Math.max(...last.map((s) => s.sec || 0)) : 0;
    const allHit = last && last.length >= sets && last.every((s) => (s.sec || 0) >= Math.max(goal, topSec));
    if (allHit && topSec) Object.assign(out, { sec: topSec + 5, up: true });
    else out.sec = Math.max(goal, topSec);
  }
  if (f.includes('m')) {
    const topM = last && last.length ? Math.max(...last.map((s) => s.m || 0)) : 0;
    out.m = topM || want.m || 20;
    if (f.includes('sec')) {
      const t = last && last.length ? Math.min(...last.map((s) => s.sec || Infinity)) : Infinity;
      out.sec = Number.isFinite(t) && t > 0 ? t : '';
    }
  }
  if (out.up) {
    out.upText = f.includes('reps') && out.kg !== '' && out.kg > topKg ? `Try ${out.kg} ${unitLabel(units)}`
      : f.includes('reps') ? `Try ${out.reps} reps` : `Try ${fmtDuration(out.sec)}`;
  }
  return out;
}

// Sets written out in the user's unit: "60 kg × 8, 8, 7", "45 s, 50 s", "24 kg × 40 m".
// Sets are normalised (normSet) with weights in kg.
export function setsText(sets, track, units = 'kg') {
  const u = unitLabel(units);
  const w = (kg) => fromKg(kg, units);
  const f = fieldsFor(track);
  if (!sets.length) return '';
  const anyKg = sets.some((s) => s.kg);
  if (f.includes('reps')) {
    if (!anyKg) return `${sets.map((s) => s.reps).join(', ')} reps`;
    const kgs = [...new Set(sets.map((s) => s.kg))];
    return kgs.length === 1 ? `${w(kgs[0])} ${u} × ${sets.map((s) => s.reps).join(', ')}` : `${sets.map((s) => `${w(s.kg)}×${s.reps}`).join(', ')} ${u}`;
  }
  if (track === 'duration' || track === 'weight_duration') {
    return sets.map((s) => (s.kg ? `${w(s.kg)} ${u} × ${fmtDuration(s.sec)}` : fmtDuration(s.sec))).join(', ');
  }
  if (track === 'distance_duration') return sets.map((s) => `${s.m} m${s.sec ? ` in ${fmtDuration(s.sec)}` : ''}`).join(', ');
  return sets.map((s) => (s.kg ? `${w(s.kg)} ${u} × ${s.m} m` : `${s.m} m`)).join(', ');
}
export const setText = (s, track, units) => setsText([s], track, units);

// The number a progress chart plots for one session, and its axis label.
export function chartValue(kind, session, units = 'kg') {
  if (kind === 'kg') return fromKg(session.e1rm || session.best.kg, units);
  if (kind === 'sec') return session.maxSec;
  if (kind === 'm') return session.maxM;
  return session.maxReps;
}
export function chartCaption(kind, session, units = 'kg') {
  if (kind === 'kg') return session && session.e1rm ? `Estimated 1-rep max, ${unitLabel(units)}` : `Heaviest set, ${unitLabel(units)}`;
  if (kind === 'sec') return 'Longest set, seconds';
  if (kind === 'm') return 'Furthest set, metres';
  return 'Best set, reps';
}
export const kindUnit = (kind, units = 'kg') => (kind === 'kg' ? unitLabel(units) : kind === 'sec' ? 's' : kind === 'm' ? 'm' : 'reps');

// ---------- asking for the weight ----------
// Weighted exercises need a weight before a set can be ticked (0 is fine and means "none"). Bodyweight work with
// optional extra weight or assistance doesn't ask: no weight just means bodyweight.
export const weightNeeded = (track, load) => hasWeight(track) && !['added', 'assisted', 'none'].includes(load);

// A weight typed in a box, in the user's unit, as a number; '' when nothing usable was typed.
export const typedWeight = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v));

// The weight (kg, as stored) an exercise's other sets are using today: the first set that has one.
export function weightSoFar(sets) {
  const s = (sets || []).find((x) => x && x.kg !== undefined && x.kg !== '' && x.kg !== null && Number.isFinite(Number(x.kg)));
  return s ? Number(s.kg) : '';
}
