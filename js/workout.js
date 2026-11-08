// In-workout tools: rest times, barbell plates, warm-up sets, exercise swaps, and the Monday recap.
import { exerciseLibrary, moveKeyForName } from './scheduler.js';
import { musclesFor } from './freshness.js';
import { collectHistory } from './progress.js';

// ---------- rest timer ----------
// Seconds between sets: longer for the big compound lifts, longer still when training for strength.
const REST = { strength: [180, 90], muscle: [120, 75], sport: [150, 90], fitness: [60, 45] };
const MAIN = new Set(['squat', 'hinge', 'horizontalPush', 'verticalPush', 'horizontalPull', 'verticalPull']);
const MAIN_NAMES = /squat|deadlift|bench press|overhead press|military press|barbell row|pull-up|chin-up/i;

export function isMainLift(move, name) {
  return MAIN.has(move) || MAIN.has(moveKeyForName(name)) || MAIN_NAMES.test(name || '');
}
export function restSeconds(goal, move, name) {
  const [main, other] = REST[goal] || REST.muscle;
  return isMainLift(move, name) ? main : other;
}

// ---------- plates ----------
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export const usesBarbell = (name) => /barbell|bench press|back squat|front squat|deadlift|overhead press|military press/i.test(name || '')
  && !/dumbbell|goblet|smith|machine|single-leg/i.test(name || '');

// Plates for one side of the bar, heaviest first. [] = empty bar. null = can't be made exactly.
export function platesPerSide(total, bar = 20, plates = PLATES) {
  if (!(total >= bar)) return null;
  let side = Math.round(((total - bar) / 2) * 1000) / 1000;
  const out = [];
  for (const p of plates) {
    while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 1000) / 1000; }
  }
  return side > 1e-6 ? null : out;
}

// ---------- warm-up ----------
// Ramp up to the working weight: empty bar first, then fewer reps as the weight climbs.
export function warmupSets(work, { bar = 20, step = 2.5, barbell = true, heavy = 60, mid = 30 } = {}) {
  if (!(work > 0)) return [];
  const round = (x) => Math.round(x / step) * step;
  const scheme = work >= heavy ? [[0, 10], [0.5, 5], [0.7, 3], [0.85, 1]] : work >= mid ? [[0, 10], [0.6, 5], [0.8, 2]] : [[0.5, 10]];
  const out = [];
  for (const [pct, reps] of scheme) {
    let kg = pct === 0 ? (barbell ? bar : round(work * 0.4)) : round(work * pct);
    if (barbell) kg = Math.max(bar, kg);
    if (kg <= 0 || kg >= work) continue;
    if (out.length && kg <= out[out.length - 1].kg) continue;
    out.push({ kg, reps });
  }
  return out;
}

// ---------- swaps ----------
const GYM_ONLY = /barbell|cable|machine|pulldown|leg press|leg curl|leg extension|pec deck|t-bar|pushdown|face pull|smith|hack|seated|crossover|bench press|deadlift|back squat|front squat|overhead press|shrug|upright row/i;
const NO_KIT = /bodyweight|push-up|pike|table row|towel|chin-up hold|bench dip|glute bridge|reverse lunge|single-leg hip hinge|^calf raise|plank|wall handstand|prone|pull-up|chin-up|^dips|hanging|crunch|sit-up/i;

// What an exercise needs: a full gym, a home setup (dumbbells, bench, bar), or nothing.
export function needs(name) {
  if (/dumbbell|goblet|bulgarian|one-arm|hammer curl|lateral raise|rear delt fly|arnold/i.test(name)) return 'home';
  if (GYM_ONLY.test(name)) return 'gym';
  if (NO_KIT.test(name)) return 'bodyweight';
  return 'home';
}
const FITS = { gym: () => true, home: (n) => needs(n) !== 'gym', bodyweight: (n) => needs(n) === 'bodyweight' };
const PATTERNS = ['push-up', 'pulldown', 'pull-up', 'chin-up', 'deadlift', 'thrust', 'bridge', 'press', 'fly', 'row', 'curl', 'squat', 'lunge', 'raise', 'extension', 'dip', 'plank'];
const patternOf = (name) => PATTERNS.find((p) => String(name).toLowerCase().includes(p)) || null;
const mainMuscles = (m) => Object.entries(m).filter(([, w]) => w >= 1).map(([k]) => k);

// Other exercises that work the same main muscles and suit the person's equipment.
export function alternatives(name, move, equipment, exclude = [], limit = 5) {
  const target = mainMuscles(musclesFor(move, name));
  if (!target.length) return [];
  const skip = new Set([name, ...exclude].map((s) => String(s).toLowerCase()));
  const pattern = patternOf(name);
  return exerciseLibrary()
    .filter((e) => !skip.has(e.name.toLowerCase()) && (FITS[equipment] || FITS.gym)(e.name))
    .map((e) => {
      const m = mainMuscles(musclesFor(null, e.name, e.group));
      const shared = m.filter((x) => target.includes(x)).length;
      const other = m.filter((x) => !target.includes(x)).length;
      const samePattern = pattern && patternOf(e.name) === pattern ? 1 : 0;
      return { name: e.name, group: e.group, score: shared * 2 - other - (shared === target.length ? 0 : 1) + samePattern };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name: n, group }) => ({ name: n, group }));
}

// ---------- Monday recap ----------
export function weekRecap({ history = {}, log = {}, prevKey, targetFor, sportCreditFor = () => 0, nameOf = (m) => m }) {
  const prev = history[prevKey];
  const done = prev ? (prev.done || []).length : 0;
  const planned = prev && prev.plan ? prev.plan.length : 0;
  const target = targetFor(prevKey);
  const met = done + Math.min(1, sportCreditFor(prevKey)) >= target;
  const best = {};
  let sets = 0;
  for (const [move, list] of Object.entries(collectHistory(log, history))) {
    for (const s of list) {
      if (s.wk !== prevKey) continue;
      sets += s.sets.length;
      if (s.pr && (!best[move] || s.best.kg > best[move].kg)) best[move] = { ...s.best };
    }
  }
  const prs = Object.entries(best).map(([move, b]) => ({ move, name: nameOf(move), kg: b.kg, reps: b.reps, sec: b.sec, m: b.m }))
    .sort((a, b) => b.kg - a.kg);
  return { hadWeek: !!prev && (done > 0 || planned > 0 || sets > 0), done, planned, target, met, prs, sets };
}
