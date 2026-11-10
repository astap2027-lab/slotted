// Muscle freshness: an estimate of how recovered each muscle is, built only from what was recorded:
// ticked sets, sessions marked done, and Strava activities. Each hard set adds load to the muscles it
// works; load fades over the following days. Freshness = how much of that load is gone.
// Every detailed muscle (quads, hamstrings and so on, down to each head) is tracked on its own; the
// body-map groups show their most tired muscle. How hard a set was (weight against your best, time,
// distance, and the optional effort tap) scales its load, and a big recent week slows recovery a little.
import { exerciseForMove, groupWeights, muscleWeights, MUSCLE_INFO, trackOf, secOf } from './exercises.js';
import { moveKeyForName } from './scheduler.js';

export const MUSCLES = [
  { id: 'chest', label: 'Chest', recoverHours: 30, full: 12 },
  { id: 'shoulders', label: 'Shoulders', recoverHours: 24, full: 10 },
  { id: 'back', label: 'Back', recoverHours: 30, full: 12 },
  { id: 'biceps', label: 'Biceps', recoverHours: 20, full: 9 },
  { id: 'triceps', label: 'Triceps', recoverHours: 20, full: 9 },
  { id: 'core', label: 'Core', recoverHours: 20, full: 9 },
  { id: 'quads', label: 'Quads', recoverHours: 32, full: 12 },
  { id: 'hamstrings', label: 'Hamstrings', recoverHours: 32, full: 11 },
  { id: 'glutes', label: 'Glutes', recoverHours: 30, full: 12 },
  { id: 'calves', label: 'Calves', recoverHours: 22, full: 10 },
  { id: 'forearms', label: 'Forearms', recoverHours: 20, full: 9 },
  { id: 'hips', label: 'Hips', recoverHours: 24, full: 10 },
  { id: 'shins', label: 'Shins', recoverHours: 20, full: 8 },
];
// Body-map groups drawn on the outline. The others (forearms, hips, shins) are listed but not drawn.
export const MAP_GROUPS = new Set(['chest', 'shoulders', 'back', 'biceps', 'triceps', 'core', 'quads', 'hamstrings', 'glutes', 'calves']);
// Every detailed muscle, recovering at its group's pace.
export const PARTS = Object.entries(MUSCLE_INFO).map(([id, m]) => ({ id, label: m.label, group: m.group }));
const PARTS_OF = PARTS.reduce((o, p) => ((o[p.group] = o[p.group] || []).push(p.id), o), {});

// How much one tap of effort changes a set's load. No tap means a normal hard set.
export const EFFORT = { easy: { label: 'Easy', factor: 0.7 }, hard: { label: 'Hard', factor: 1 }, fail: { label: 'To failure', factor: 1.2 } };
const fClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fE1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 15) / 30) : 0);

// How hard one set was compared with a normal working set (1). ref = best estimated 1-rep max on this exercise.
export function setLoad(set, track, ref = 0, assisted = false) {
  if (!set) return 0;
  let f = (EFFORT[set.effort] || EFFORT.hard).factor;
  const kg = Number(set.kg) || 0;
  const reps = Number(set.reps) || 0;
  if ((track === 'weight_reps' || track === 'reps' || !track) && kg > 0 && ref > 0 && !assisted) {
    // Light sets count for less; sets near your best count in full.
    f *= fClamp(0.6 + 0.45 * (fE1rm(kg, reps) / ref), 0.6, 1.05);
  } else if (track === 'duration' || track === 'weight_duration') {
    f *= fClamp(secOf(set, track) / 40, 0.5, 1.3);
  } else if (track === 'distance_duration' || track === 'weight_distance') {
    f *= fClamp((Number(set.m) || 0) / 40, 0.5, 1.3);
  }
  return fClamp(f, 0.3, 1.5);
}

// Detailed muscles an exercise works. Exercises outside the library spread their group weights over the group.
export function partsFor(move, name, group) {
  const ex = exerciseForMove(move, name);
  if (ex) return muscleWeights(ex);
  const out = {};
  for (const [g, w] of Object.entries(musclesFor(move, name, group))) for (const id of PARTS_OF[g] || []) out[id] = Math.max(out[id] || 0, w);
  return out;
}

// How much each set of a movement works each muscle (1 = main muscle).
const MOVE_MUSCLES = {
  squat: { quads: 1, glutes: 1, hamstrings: 0.3, core: 0.3 },
  hinge: { hamstrings: 1, glutes: 1, back: 0.5 },
  singleLeg: { quads: 1, glutes: 1, hamstrings: 0.3 },
  glutes: { glutes: 1, hamstrings: 0.5 },
  calves: { calves: 1 },
  horizontalPush: { chest: 1, triceps: 0.5, shoulders: 0.5 },
  inclinePush: { chest: 1, shoulders: 0.5, triceps: 0.5 },
  verticalPush: { shoulders: 1, triceps: 0.5 },
  lateral: { shoulders: 1 },
  rearDelt: { shoulders: 1, back: 0.3 },
  horizontalPull: { back: 1, biceps: 0.5 },
  verticalPull: { back: 1, biceps: 0.5 },
  biceps: { biceps: 1 },
  triceps: { triceps: 1 },
  core: { core: 1 },
};

// Exercises people type into their own routine, matched by name.
const NAME_RULES = [
  [/deadlift|rdl|good morning/, { hamstrings: 1, glutes: 1, back: 0.7 }],
  [/leg curl|hamstring curl|nordic/, { hamstrings: 1 }],
  [/leg extension/, { quads: 1 }],
  [/calf/, { calves: 1 }],
  [/hip thrust|glute|bridge/, { glutes: 1, hamstrings: 0.5 }],
  [/squat|leg press|lunge|step.?up|hack/, { quads: 1, glutes: 1, hamstrings: 0.3 }],
  [/skull|pushdown|tricep|close.?grip|kickback/, { triceps: 1 }],
  [/dip/, { chest: 0.7, triceps: 1 }],
  [/curl/, { biceps: 1 }],
  [/fly|crossover|pec deck|bench|chest press|push.?up/, { chest: 1, triceps: 0.5, shoulders: 0.5 }],
  [/lateral|upright row|rear delt|face pull/, { shoulders: 1 }],
  [/overhead press|shoulder press|military|arnold|pike/, { shoulders: 1, triceps: 0.5 }],
  [/shrug/, { back: 1 }],
  [/row|pull.?up|chin.?up|pulldown|lat /, { back: 1, biceps: 0.5 }],
  [/plank|crunch|leg raise|rollout|sit.?up|ab /, { core: 1 }],
];

const GROUP_MUSCLES = {
  chest: { chest: 1 }, back: { back: 1 }, shoulders: { shoulders: 1 },
  arms: { biceps: 0.6, triceps: 0.6 }, legs: { quads: 0.8, glutes: 0.8, hamstrings: 0.5 }, core: { core: 1 },
};

// Muscles worked by an exercise: by built-in movement, then by name, then by the muscle group picked.
export function musclesFor(move, name, group) {
  // The exercise library knows each exercise's muscles in detail; use it whenever the exercise is in it.
  const ex = exerciseForMove(move, name);
  if (ex) return groupWeights(ex);
  if (MOVE_MUSCLES[move]) return MOVE_MUSCLES[move];
  const known = moveKeyForName(name);
  if (known && MOVE_MUSCLES[known]) return MOVE_MUSCLES[known];
  const n = ` ${String(name || '').toLowerCase()} `;
  for (const [re, m] of NAME_RULES) if (re.test(n)) return m;
  return GROUP_MUSCLES[group] || {};
}

// Strava activities, in set-equivalents per minute. Gym workouts are skipped: those are logged in Slotted.
export function activityLoad(a) {
  const t = String(a.type || '').toLowerCase();
  const mins = Number(a.minutes) || 0;
  let muscles = {};
  let perMin = 0;
  if (/run/.test(t)) { muscles = { quads: 0.8, hamstrings: 0.6, glutes: 0.6, calves: 1 }; perMin = 1 / 10; }
  else if (/ride|cycl|bike/.test(t)) { muscles = { quads: 1, glutes: 0.6, calves: 0.3 }; perMin = 1 / 15; }
  else if (/swim/.test(t)) { muscles = { back: 1, shoulders: 1, triceps: 0.3 }; perMin = 1 / 15; }
  else if (/row/.test(t)) { muscles = { back: 1, quads: 0.5, biceps: 0.3 }; perMin = 1 / 15; }
  else if (/walk|hike/.test(t)) { muscles = { calves: 0.5, quads: 0.4 }; perMin = 1 / 30; }
  else if (/basketball|soccer|football|rugby|tennis|netball|volleyball|hockey|squash|badminton|pickleball|cricket|sail|surf|ski|skate/.test(t)) {
    muscles = { quads: 0.8, calves: 1, glutes: 0.5, hamstrings: 0.5 }; perMin = 1 / 12;
  }
  const sets = Math.min(8, mins * perMin) * (a.hard ? 1.4 : 1);
  return { muscles, sets };
}

const atTime = (weekStart, day, minutes) => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + day);
  d.setHours(0, minutes || 12 * 60, 0, 0);
  return d;
};

// Best estimated 1-rep max for each logged move, so a set can be compared with what you can lift.
function bestRefs(log) {
  const ref = {};
  for (const sessions of Object.values(log || {})) {
    for (const moves of Object.values(sessions || {})) {
      for (const [move, list] of Object.entries(moves || {})) {
        for (const x of list || []) if (x && x.done) ref[move] = Math.max(ref[move] || 0, fE1rm(Number(x.kg) || 0, Number(x.reps) || 0));
      }
    }
  }
  return ref;
}

/**
 * @param data.log        state.log
 * @param data.history    state.history (for when each session was planned and which were marked done)
 * @param data.weekStart  week key -> Date of that Monday
 * @param data.exercise   move key -> { name, group } for exercises in the person's own routine
 * @param data.activities Strava activities: { type, minutes, hard, date: 'YYYY-MM-DD', start: 'HH:MM' }
 * @param data.now        Date
 */
export function computeFreshness({ log = {}, history = {}, weekStart, exercise = () => ({}), activities = [], now = new Date() }) {
  const spec = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));
  const groupOf = Object.fromEntries(PARTS.map((p) => [p.id, p.group]));
  const windowStart = now.getTime() - 7 * 864e5;
  const work = []; // { parts: { id: weight }, amount, t }
  let sets = 0;
  let sessions = 0;
  let recentActivities = 0;
  const refs = bestRefs(log);

  // Records work and returns true when it falls inside the 7-day window.
  // Work later today counts now (sets can be ticked before the planned start); work on a later day doesn't count yet.
  const dayEnd = new Date(now).setHours(23, 59, 59, 999);
  const add = (parts, amount, when) => {
    if (when.getTime() > dayEnd) return false;
    const t = Math.min(when.getTime(), now.getTime());
    if (t < windowStart || amount <= 0) return false;
    work.push({ parts, amount, t });
    return true;
  };

  for (const [wk, wkSessions] of Object.entries(history)) {
    const plan = wkSessions.plan || [];
    const logged = log[wk] || {};
    // Ticked sets, each scaled by how hard it was.
    for (const [sk, moves] of Object.entries(logged)) {
      const s = plan.find((p) => p.key === sk);
      const when = atTime(weekStart(wk), s ? s.day : 0, s ? s.start : null);
      let counted = false;
      for (const [move, list] of Object.entries(moves)) {
        const done = (list || []).filter((x) => x && x.done);
        if (!done.length) continue;
        const info = exercise(move) || {};
        const ex = exerciseForMove(move, info.name);
        const track = ex ? trackOf(ex) : null;
        const amount = done.reduce((t, x) => t + setLoad(x, track, refs[move], !!(ex && ex.load === 'assisted')), 0);
        if (!add(partsFor(move, info.name, info.group), amount, when)) continue;
        sets += done.length;
        counted = true;
      }
      if (counted) sessions++;
    }
    // Sessions marked done without logging: count their planned sets.
    for (const sk of wkSessions.done || []) {
      const loggedSets = Object.values(logged[sk] || {}).some((l) => (l || []).some((x) => x && x.done));
      const s = plan.find((p) => p.key === sk);
      if (loggedSets || !s || !s.exercises) continue;
      const when = atTime(weekStart(wk), s.day, s.start);
      let counted = false;
      for (const x of s.exercises) {
        const info = exercise(x.move) || {};
        if (add(partsFor(x.move, x.name || info.name, info.group), Number(x.sets) || 0, when)) counted = true;
      }
      if (counted) sessions++;
    }
  }

  for (const a of activities) {
    if (!a.date) continue;
    const [y, m, d] = a.date.split('-').map(Number);
    const [hh, mm] = String(a.start || '12:00').split(':').map(Number);
    const { muscles, sets: amount } = activityLoad(a);
    const parts = {};
    for (const [g, w] of Object.entries(muscles)) for (const id of PARTS_OF[g] || []) parts[id] = w;
    if (add(parts, amount, new Date(y, m - 1, d, hh, mm))) recentActivities++;
  }

  // Recent volume per muscle (undecayed). A week well past a muscle's usual full load slows its recovery.
  const vol = {};
  for (const w of work) for (const [id, wt] of Object.entries(w.parts)) vol[id] = (vol[id] || 0) + w.amount * wt;
  const load = {};
  const last = {};
  for (const w of work) {
    const hours = (now.getTime() - w.t) / 36e5;
    for (const [id, wt] of Object.entries(w.parts)) {
      const g = spec[groupOf[id]];
      if (!g) continue;
      const slow = 1 + 0.3 * fClamp(((vol[id] || 0) - g.full) / g.full, 0, 1);
      load[id] = (load[id] || 0) + w.amount * wt * Math.exp(-hours / (g.recoverHours * slow));
      if (wt >= 0.5 && (!last[id] || w.t > last[id])) last[id] = w.t;
    }
  }

  const detail = PARTS.map((p) => {
    const g = spec[p.group];
    return {
      id: p.id, label: p.label, group: p.group,
      fresh: Math.round(100 * (1 - Math.min(1, (load[p.id] || 0) / g.full))),
      lastWorked: last[p.id] ? new Date(last[p.id]) : null,
      volume: Math.round((vol[p.id] || 0) * 10) / 10,
    };
  });
  // Each body-map group shows its most tired muscle, so a group is never shown fresher than any part of it.
  const muscles = MUSCLES.map((m) => {
    const parts = detail.filter((p) => p.group === m.id);
    const worst = parts.reduce((a, b) => (b.fresh < a.fresh ? b : a), parts[0]);
    const lastT = Math.max(0, ...parts.map((p) => (p.lastWorked ? p.lastWorked.getTime() : 0)));
    return { id: m.id, label: m.label, fresh: worst ? worst.fresh : 100, lastWorked: lastT ? new Date(lastT) : null, parts: parts.map((p) => p.id) };
  });
  // Counts only cover the 7-day window, so they match what the estimate is built from.
  return { muscles, detail, sets, sessions, activities: recentActivities, hasData: sets > 0 || sessions > 0 || recentActivities > 0 };
}

export const freshnessLevel = (pct) => (pct >= 85 ? 0 : pct >= 65 ? 1 : pct >= 40 ? 2 : 3);
export const LEVEL_LABELS = ['Recovered', 'Mostly recovered', 'Partly recovered', 'Still fatigued'];
