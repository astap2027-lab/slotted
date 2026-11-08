// Muscle freshness: an estimate of how recovered each muscle is, built only from what was recorded:
// ticked sets, sessions marked done, and Strava activities. Each hard set adds load to the muscles it
// works; load fades over the following days. Freshness = how much of that load is gone.
import { exerciseForMove, groupWeights } from './exercises.js';
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
];

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

/**
 * @param data.log        state.log
 * @param data.history    state.history (for when each session was planned and which were marked done)
 * @param data.weekStart  week key -> Date of that Monday
 * @param data.exercise   move key -> { name, group } for exercises in the person's own routine
 * @param data.activities Strava activities: { type, minutes, hard, date: 'YYYY-MM-DD', start: 'HH:MM' }
 * @param data.now        Date
 */
export function computeFreshness({ log = {}, history = {}, weekStart, exercise = () => ({}), activities = [], now = new Date() }) {
  const load = Object.fromEntries(MUSCLES.map((m) => [m.id, 0]));
  const last = {};
  const spec = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));
  let sets = 0;
  let sessions = 0;
  let recentActivities = 0;
  const windowStart = now.getTime() - 7 * 864e5;

  // Adds load and returns true when the work falls inside the 7-day window.
  const add = (muscles, amount, when) => {
    const t = Math.min(when.getTime(), now.getTime());
    if (t < windowStart || amount <= 0) return false;
    const hours = (now.getTime() - t) / 36e5;
    for (const [id, w] of Object.entries(muscles)) {
      if (!spec[id]) continue;
      load[id] += amount * w * Math.exp(-hours / spec[id].recoverHours);
      if (w >= 0.5 && (!last[id] || t > last[id])) last[id] = t;
    }
    return true;
  };

  for (const [wk, wkSessions] of Object.entries(history)) {
    const plan = wkSessions.plan || [];
    const logged = log[wk] || {};
    // Ticked sets.
    for (const [sk, moves] of Object.entries(logged)) {
      const s = plan.find((p) => p.key === sk);
      const when = atTime(weekStart(wk), s ? s.day : 0, s ? s.start : null);
      let counted = false;
      for (const [move, list] of Object.entries(moves)) {
        const done = (list || []).filter((x) => x && x.done).length;
        if (!done) continue;
        const info = exercise(move) || {};
        if (!add(musclesFor(move, info.name, info.group), done, when)) continue;
        sets += done;
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
        if (add(musclesFor(x.move, x.name || info.name, info.group), Number(x.sets) || 0, when)) counted = true;
      }
      if (counted) sessions++;
    }
  }

  for (const a of activities) {
    if (!a.date) continue;
    const [y, m, d] = a.date.split('-').map(Number);
    const [hh, mm] = String(a.start || '12:00').split(':').map(Number);
    const { muscles, sets: amount } = activityLoad(a);
    if (add(muscles, amount, new Date(y, m - 1, d, hh, mm))) recentActivities++;
  }

  const muscles = MUSCLES.map((m) => ({
    id: m.id,
    label: m.label,
    fresh: Math.round(100 * (1 - Math.min(1, load[m.id] / m.full))),
    lastWorked: last[m.id] ? new Date(last[m.id]) : null,
  }));
  // Counts only cover the 7-day window, so they match what the estimate is built from.
  return { muscles, sets, sessions, activities: recentActivities, hasData: sets > 0 || sessions > 0 || recentActivities > 0 };
}

export const freshnessLevel = (pct) => (pct >= 85 ? 0 : pct >= 65 ? 1 : pct >= 40 ? 2 : 3);
export const LEVEL_LABELS = ['Recovered', 'Mostly recovered', 'Partly recovered', 'Still fatigued'];
