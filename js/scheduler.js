// Scheduler: places training sessions into a student's week around
// school, sport and other commitments. Pure functions, no DOM.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- time helpers ----------
export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const fmtTime = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
};

// ---------- sessions ----------
// legs: 'heavy' | 'some' | 'none' — how much the session loads the legs.
export const SESSIONS = {
  fullA: { name: 'Full body A', groups: ['legs', 'chest', 'back', 'shoulders', 'arms'], legs: 'some', moves: ['squat', 'horizontalPush', 'horizontalPull', 'hinge', 'core'] },
  fullB: { name: 'Full body B', groups: ['legs', 'chest', 'back', 'shoulders', 'arms'], legs: 'some', moves: ['hinge', 'verticalPush', 'verticalPull', 'singleLeg', 'biceps'] },
  fullC: { name: 'Full body C', groups: ['legs', 'chest', 'back', 'shoulders', 'arms'], legs: 'some', moves: ['singleLeg', 'inclinePush', 'horizontalPull', 'glutes', 'triceps'] },
  upperA: { name: 'Upper A', groups: ['chest', 'back', 'shoulders', 'arms'], legs: 'none', moves: ['horizontalPush', 'horizontalPull', 'verticalPush', 'verticalPull', 'biceps', 'triceps'] },
  upperB: { name: 'Upper B', groups: ['chest', 'back', 'shoulders', 'arms'], legs: 'none', moves: ['verticalPull', 'inclinePush', 'horizontalPull', 'lateral', 'triceps', 'biceps'] },
  lowerA: { name: 'Lower A', groups: ['legs'], legs: 'heavy', moves: ['squat', 'hinge', 'singleLeg', 'calves', 'core'] },
  lowerB: { name: 'Lower B', groups: ['legs'], legs: 'heavy', moves: ['hinge', 'singleLeg', 'glutes', 'squat', 'core'] },
  push: { name: 'Push', groups: ['chest', 'shoulders', 'triceps'], legs: 'none', moves: ['horizontalPush', 'verticalPush', 'inclinePush', 'lateral', 'triceps'] },
  pull: { name: 'Pull', groups: ['back', 'biceps'], legs: 'none', moves: ['verticalPull', 'horizontalPull', 'rearDelt', 'biceps', 'core'] },
  legs: { name: 'Legs', groups: ['legs'], legs: 'heavy', moves: ['squat', 'hinge', 'singleLeg', 'glutes', 'calves'] },
  push2: { name: 'Push B', groups: ['chest', 'shoulders', 'triceps'], legs: 'none', moves: ['inclinePush', 'verticalPush', 'horizontalPush', 'lateral', 'triceps'] },
  pull2: { name: 'Pull B', groups: ['back', 'biceps'], legs: 'none', moves: ['horizontalPull', 'verticalPull', 'rearDelt', 'biceps', 'core'] },
  legs2: { name: 'Legs B', groups: ['legs'], legs: 'heavy', moves: ['hinge', 'squat', 'singleLeg', 'glutes', 'core'] },
};

export const SPLITS = {
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2'],
};

export const SPLIT_NAMES = {
  2: 'Full body, twice a week',
  3: 'Full body, three times a week',
  4: 'Upper / lower',
  5: 'Upper / lower + push, pull, legs',
  6: 'Push, pull, legs, twice through',
};

// ---------- exercises ----------
const MOVES = {
  gym: {
    squat: 'Barbell back squat', hinge: 'Romanian deadlift', singleLeg: 'Walking lunge', glutes: 'Hip thrust',
    calves: 'Standing calf raise', horizontalPush: 'Bench press', inclinePush: 'Incline dumbbell press',
    verticalPush: 'Overhead press', horizontalPull: 'Seated cable row', verticalPull: 'Lat pulldown',
    lateral: 'Lateral raise', rearDelt: 'Face pull', biceps: 'Dumbbell curl', triceps: 'Triceps pushdown', core: 'Plank',
  },
  home: {
    squat: 'Goblet squat', hinge: 'Dumbbell Romanian deadlift', singleLeg: 'Bulgarian split squat', glutes: 'Dumbbell hip thrust',
    calves: 'Single-leg calf raise', horizontalPush: 'Dumbbell bench press', inclinePush: 'Incline dumbbell press',
    verticalPush: 'Dumbbell shoulder press', horizontalPull: 'One-arm dumbbell row', verticalPull: 'Pull-up',
    lateral: 'Lateral raise', rearDelt: 'Rear delt fly', biceps: 'Dumbbell curl', triceps: 'Overhead triceps extension', core: 'Plank',
  },
  bodyweight: {
    squat: 'Bodyweight squat', hinge: 'Single-leg hip hinge', singleLeg: 'Reverse lunge', glutes: 'Glute bridge',
    calves: 'Calf raise', horizontalPush: 'Push-up', inclinePush: 'Decline push-up',
    verticalPush: 'Pike push-up', horizontalPull: 'Table row', verticalPull: 'Pull-up or towel row',
    lateral: 'Wall handstand hold', rearDelt: 'Prone Y raise', biceps: 'Chin-up hold', triceps: 'Bench dip', core: 'Plank',
  },
};

// Which built-in movement an exercise name belongs to, e.g. 'Goblet squat' -> 'squat'.
export function moveKeyForName(name) {
  const n = String(name || '').trim().toLowerCase();
  for (const names of Object.values(MOVES)) for (const [m, label] of Object.entries(names)) if (label.toLowerCase() === n) return m;
  return null;
}

export const moveName = (move, equipment) => CUSTOM_NAMES[move] || (MOVES[equipment] || MOVES.gym)[move] || move;

const PRIMARY = new Set(['squat', 'hinge', 'horizontalPush', 'verticalPush', 'horizontalPull', 'verticalPull']);

const PRESCRIPTION = {
  strength: { primary: [4, '5'], accessory: [3, '8'] },
  muscle: { primary: [3, '8–10'], accessory: [3, '10–12'] },
  fitness: { primary: [3, '12'], accessory: [2, '15'] },
  sport: { primary: [4, '4–6'], accessory: [3, '8'] },
};

export function exercisesFor(sessionKey, profile, short = false) {
  const custom = CUSTOM[baseKey(sessionKey)];
  if (custom) {
    const list = custom.exercises.map(({ move, name, sets, reps }) => ({ move, name, sets, reps }));
    return short ? list.slice(0, 3) : list;
  }
  const s = SESSIONS[baseKey(sessionKey)];
  const names = MOVES[profile.equipment] || MOVES.gym;
  const rx = PRESCRIPTION[profile.goal] || PRESCRIPTION.muscle;
  const beginner = profile.level === 'beginner';
  const moves = short ? s.moves.slice(0, 3) : s.moves;
  return moves.map((m) => {
    const isPrimary = PRIMARY.has(m);
    let [sets, reps] = isPrimary ? rx.primary : rx.accessory;
    if (beginner) sets = Math.max(2, sets - 1);
    if (m === 'core') reps = '30–45s';
    return { move: m, name: names[m], sets, reps };
  });
}

// ---------- custom routines ----------
// People who already have a program enter it; the scheduler places it the same way.
export const GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const GROUP_OF = {
  squat: 'legs', hinge: 'legs', singleLeg: 'legs', glutes: 'legs', calves: 'legs',
  horizontalPush: 'chest', inclinePush: 'chest', verticalPush: 'shoulders', lateral: 'shoulders', rearDelt: 'shoulders',
  horizontalPull: 'back', verticalPull: 'back', biceps: 'arms', triceps: 'arms', core: 'core',
};
const EXTRA_EXERCISES = {
  'Deadlift': 'legs', 'Leg press': 'legs', 'Leg curl': 'legs', 'Leg extension': 'legs', 'Front squat': 'legs',
  'Chest fly': 'chest', 'Dips': 'chest', 'Cable crossover': 'chest',
  'Barbell row': 'back', 'Chin-up': 'back', 'Shrug': 'back', 'T-bar row': 'back',
  'Arnold press': 'shoulders', 'Upright row': 'shoulders',
  'Hammer curl': 'arms', 'Barbell curl': 'arms', 'Skull crusher': 'arms', 'Close-grip bench press': 'arms',
  'Hanging leg raise': 'core', 'Cable crunch': 'core', 'Ab wheel rollout': 'core',
};

export function exerciseLibrary() {
  const lib = new Map();
  for (const names of Object.values(MOVES)) for (const [m, n] of Object.entries(names)) if (!lib.has(n)) lib.set(n, GROUP_OF[m]);
  for (const [n, g] of Object.entries(EXTRA_EXERCISES)) if (!lib.has(n)) lib.set(n, g);
  return [...lib].map(([name, group]) => ({ name, group })).sort((a, b) => a.name.localeCompare(b.name));
}

export const exerciseKey = (name) => `x_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const CUSTOM = {};
const CUSTOM_NAMES = {};
const baseKey = (key) => String(key).split('#')[0];

// Turn the user's routine into session definitions the planner understands.
export function setCustomRoutine(routine) {
  for (const k of Object.keys(CUSTOM)) delete CUSTOM[k];
  for (const w of (routine && routine.workouts) || []) {
    const exercises = (w.exercises || []).filter((e) => e.name && e.name.trim()).map((e) => ({
      move: exerciseKey(e.name), name: e.name.trim(),
      sets: Math.max(1, Math.min(10, Math.round(Number(e.sets)) || 3)),
      reps: String(e.reps || '').trim() || '8–12',
      group: GROUPS.includes(e.group) ? e.group : 'core',
    }));
    exercises.forEach((e) => { CUSTOM_NAMES[e.move] = e.name; });
    const legCount = exercises.filter((e) => e.group === 'legs').length;
    CUSTOM[`c_${w.id}`] = {
      name: (w.name || '').trim() || 'Workout',
      groups: [...new Set(exercises.map((e) => e.group).filter((g) => g !== 'core'))],
      legs: legCount === 0 ? 'none' : legCount * 2 >= exercises.length ? 'heavy' : 'some',
      exercises,
    };
  }
}
// Names of exercises that were logged but later removed from the routine.
export function rememberExerciseNames(map) { Object.assign(CUSTOM_NAMES, map || {}); }
export const customExerciseNames = () => ({ ...CUSTOM_NAMES });

export const isCustom = (key) => !!CUSTOM[baseKey(key)];
export function sessionInfo(key) {
  const b = baseKey(key);
  return SESSIONS[b] || CUSTOM[b] || { name: 'Workout', groups: [], legs: 'none', moves: [] };
}

// Which workouts this week gets. Custom routines rotate in order and carry on where last week stopped.
export function routineKeys(profile, routine, weekIndex = 0, busy = false) {
  const ids = ((routine && routine.workouts) || []).map((w) => `c_${w.id}`).filter((k) => CUSTOM[k] && CUSTOM[k].exercises.length);
  if (!ids.length) return null;
  const perWeek = profile.sessionsPerWeek;
  const n = busy ? busyCount(perWeek) : perWeek;
  const start = (((weekIndex * perWeek) % ids.length) + ids.length) % ids.length;
  const seen = {};
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = ids[(start + i) % ids.length];
    seen[k] = (seen[k] || 0) + 1;
    out.push(seen[k] > 1 ? `${k}#${seen[k]}` : k);
  }
  return out;
}

// ---------- weeks ----------
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}
export function weekKey(date) {
  const d = mondayOf(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addWeeks(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n * 7);
  return weekKey(d);
}
export function weeksBetween(aKey, bKey) {
  return Math.round((keyToDate(bKey) - keyToDate(aKey)) / (7 * 864e5));
}
// Which template (A or B) a given week uses.
export function weekType(key, abAnchor) {
  if (!abAnchor) return 'A';
  const diff = weeksBetween(abAnchor.week, key);
  const flip = ((diff % 2) + 2) % 2 === 1;
  return flip ? (abAnchor.type === 'A' ? 'B' : 'A') : abAnchor.type;
}

// ---------- free slots ----------
const BUFFER = 15; // travel / change time either side of a commitment
const SHORT_MIN = 30;

export function freeGaps(blocks, day, window) {
  const start = toMin(window.start);
  const end = toMin(window.end);
  const busy = blocks
    .filter((b) => b.day === day)
    // Travel or preparation time set on a commitment (minutes before and after) adds to the usual buffer.
    .map((b) => [Math.max(start, toMin(b.start) - BUFFER - (Number(b.before) || 0)), Math.min(end, toMin(b.end) + BUFFER + (Number(b.after) || 0))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let cursor = start;
  for (const [a, b] of busy) {
    if (a > cursor) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (end > cursor) gaps.push([cursor, end]);
  return gaps;
}

// Preference for a start time: lower is better. `when` is the athlete's preferred time of day.
export const TIME_PREFS = ['afternoon', 'morning', 'evening'];
function timePref(t, when = 'afternoon') {
  const h = t / 60;
  if (when === 'morning') {
    if (h >= 7 && h < 9) return 0;
    if (h >= 5 && h < 7) return 0.3;
    if (h >= 9 && h < 12) return 1;
    if (h >= 15 && h < 18) return 2.5;
    if (h >= 18 && h < 20) return 3;
    return 3.5;
  }
  if (when === 'evening') {
    if (h >= 18 && h < 21) return 0;
    if (h >= 15 && h < 18) return 1;
    if (h >= 9 && h < 12) return 1.5;
    if (h >= 6 && h < 8) return 3;
    return 3.5;
  }
  if (h >= 15 && h < 18) return 0;
  if (h >= 9 && h < 12) return 1;
  if (h >= 18 && h < 20) return 1.5;
  if (h >= 6 && h < 8) return 4; // early mornings only when they'd otherwise go without
  return 4;
}

const ANCHORS = [16 * 60, 9 * 60, 17 * 60, 10 * 60, 7 * 60, 18 * 60, 18 * 60 + 30, 19 * 60, 6 * 60 + 30];

// Best slot for a day: full-length if possible, else a short slot (>= 30 min), else null.
export function bestSlot(blocks, day, window, length, when = 'afternoon') {
  const gaps = freeGaps(blocks, day, window);
  let best = null;
  const consider = (start, len, short) => {
    const pref = timePref(start, when) + (short ? 10 : 0);
    if (!best || pref < best.pref || (pref === best.pref && start < best.start)) {
      best = { start, end: start + len, short, pref };
    }
  };
  for (const [a, b] of gaps) {
    if (b - a >= length) {
      consider(a, length, false);
      for (const t of ANCHORS) if (t >= a && t + length <= b) consider(t, length, false);
    }
  }
  if (best) return best;
  for (const [a, b] of gaps) {
    const len = b - a;
    if (len >= SHORT_MIN) consider(a, Math.min(len, length), true);
  }
  return best;
}

// ---------- the planner ----------
function sportOn(blocks, day) {
  const sport = blocks.filter((b) => b.day === day && b.type === 'sport');
  if (!sport.length) return null;
  const hard = sport.find((b) => b.intensity === 'hard');
  return hard || sport[0];
}

function permutations(days, n) {
  const out = [];
  const used = new Array(days.length).fill(false);
  const cur = [];
  const rec = () => {
    if (cur.length === n) { out.push(cur.slice()); return; }
    for (let i = 0; i < days.length; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(days[i]);
      rec();
      used[i] = false; cur.pop();
    }
  };
  rec();
  return out;
}

const shares = (a, b) => sessionInfo(a).groups.some((g) => sessionInfo(b).groups.includes(g));

function legPenalty(sessionKey, sport, dayBefore) {
  if (!sport) return 0;
  const legs = sessionInfo(sessionKey).legs;
  const hard = sport.intensity === 'hard';
  const base = legs === 'heavy' ? (dayBefore ? 60 : 80) : legs === 'some' ? (dayBefore ? 25 : 40) : 0;
  return hard ? base : base / 4;
}

// fixed: sessions already locked in place this week ({ key, day }); they count for spacing but aren't moved.
export function scoreAssignment(order, assignment, ctx) {
  const { slots, sport, fixed = [] } = ctx;
  let score = 0;
  const gymDay = new Array(7).fill(null);
  const placed = new Array(7).fill(false);
  fixed.forEach((f) => { gymDay[f.day] = f.key; });
  assignment.forEach((d, i) => { gymDay[d] = order[i]; placed[d] = true; });

  for (let d = 0; d < 7; d++) {
    const s = gymDay[d];
    if (!s) continue;
    if (placed[d]) {
      score += slots[d].pref * 2;
      score += legPenalty(s, sport[d], false);
      score += legPenalty(s, sport[(d + 1) % 7], true) * (d === 6 ? 0.6 : 1);
      if (sport[d] && sport[d].intensity === 'hard') score += 6;
    }
    const next = gymDay[(d + 1) % 7];
    if (next && (placed[d] || placed[(d + 1) % 7])) {
      if (shares(s, next)) score += d === 6 ? 30 : 50;
      score += 6; // back-to-back days: fine for different muscles, but spread out when there's room
    }
  }

  // Runs of hard days (gym or hard sport), counted around the week.
  const hard = gymDay.map((s, d) => !!s || (sport[d] && sport[d].intensity === 'hard'));
  if (hard.every(Boolean)) score += 100;
  else {
    const startIdx = hard.findIndex((h) => !h);
    let run = 0;
    for (let k = 1; k <= 7; k++) {
      const d = (startIdx + k) % 7;
      if (hard[d]) run++;
      else { if (run > 2) score += (run - 2) * 25; run = 0; }
    }
  }

  // Mild preference for keeping the split's order through the week.
  for (let i = 0; i < assignment.length; i++)
    for (let j = i + 1; j < assignment.length; j++)
      if (assignment[i] > assignment[j]) score += 0.5;

  return score;
}

function hardRuns(plan, sport) {
  const hard = new Array(7).fill(false);
  plan.forEach((p) => { hard[p.day] = true; });
  sport.forEach((s, d) => { if (s && s.intensity === 'hard') hard[d] = true; });
  const runs = [];
  let start = -1;
  for (let d = 0; d <= 7; d++) {
    if (d < 7 && hard[d]) { if (start < 0) start = d; }
    else if (start >= 0) { if (d - start >= 3) runs.push([start, d - 1]); start = -1; }
  }
  return runs;
}

function combinations(items, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < items.length; i++) { cur.push(items[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

// Busy weeks: fewer, shorter full-body sessions that keep the main lifts going.
export const busyCount = (n) => (n >= 5 ? 3 : 2);
export const BUSY_LENGTH = 45;

export function sessionKeysFor(profile, busy) {
  if (busy) return SPLITS[busyCount(profile.sessionsPerWeek)];
  return SPLITS[profile.sessionsPerWeek] || SPLITS[3];
}

/**
 * Build or rebuild a week plan.
 * @param {object} profile  { goal, level, equipment, sessionsPerWeek, sessionLength }
 * @param {Array}  blocks   commitments for this week's template: { day, start, end, type, label, intensity }
 * @param {object} window   { start: 'HH:MM', end: 'HH:MM' } earliest and latest training times
 * @param {object} opts
 *   keys     session keys to place (defaults to the profile's split)
 *   fixed    sessions locked in place: [{ key, day, start, end, short }]
 *   fromDay  first day (0 = Monday) new sessions may go on
 *   nowMin   minutes past midnight now; sessions on fromDay must start after this
 *   busy     busy week: shorter sessions, main lifts only
 *   skipDays days the user can't train this week
 *   keepOrder keep sessions in the given order through the week (custom routines)
 *   dayWindows { [day]: { start, end } } training hours for particular days
 */
export function planWeek(profile, blocks, window, opts = {}) {
  const busy = !!opts.busy;
  const keys = opts.keys || sessionKeysFor(profile, busy);
  const fixed = opts.fixed || [];
  const fromDay = opts.fromDay || 0;
  const replanning = fixed.length > 0 || fromDay > 0 || !!(opts.skipDays && opts.skipDays.length);
  const length = busy ? Math.min(BUSY_LENGTH, profile.sessionLength) : profile.sessionLength;
  const warnings = [];
  const slots = [];
  const sport = [];
  for (let d = 0; d < 7; d++) {
    sport[d] = sportOn(blocks, d);
    // A day can have its own training hours (for example, free earlier on Wednesday mornings).
    let win = (opts.dayWindows && opts.dayWindows[d]) || window;
    if (opts.nowMin != null && d === fromDay) {
      const earliest = Math.ceil((opts.nowMin + 15) / 15) * 15;
      if (earliest >= toMin(window.end)) { slots[d] = null; continue; }
      win = { start: toHHMM(Math.max(toMin(win.start), earliest)), end: win.end };
    }
    slots[d] = bestSlot(blocks, d, win, length, profile.timeOfDay);
  }
  const fixedDays = new Set(fixed.map((f) => f.day));
  const available = [];
  const skip = new Set(opts.skipDays || []);
  for (let d = fromDay; d < 7; d++) if (slots[d] && !fixedDays.has(d) && !skip.has(d)) available.push(d);

  // Pick which sessions to keep when there aren't enough days, then where they go.
  const n = Math.min(keys.length, available.length);
  const ctx = { slots, sport, fixed };
  let best = null;
  if (n > 0) {
    for (const kept of combinations(keys, n)) {
      for (const assignment of permutations(available, n)) {
        if (opts.keepOrder && assignment.some((d, i) => i > 0 && d < assignment[i - 1])) continue;
        const score = scoreAssignment(kept, assignment, ctx);
        if (!best || score < best.score) best = { kept, assignment, score };
      }
    }
  }
  const kept = best ? best.kept : [];
  const dropped = keys.filter((k) => !kept.includes(k));

  const makeSession = (key, day, slot, extraNotes = []) => {
    const notes = [];
    const today = sport[day];
    const tomorrow = sport[(day + 1) % 7];
    if (today) notes.push(`${today.label || 'Sport'} today`);
    if (tomorrow && tomorrow.intensity === 'hard' && sessionInfo(key).legs === 'none')
      notes.push(`Upper body only, ${tomorrow.label || 'sport'} tomorrow`);
    if (slot.short) notes.push(`Short version, only ${slot.end - slot.start} minutes free`);
    else if (busy) notes.push('Busy week: main lifts only');
    return {
      key, name: sessionInfo(key).name, day, start: slot.start, end: slot.end,
      short: slot.short || busy, notes: [...notes, ...extraNotes],
      exercises: exercisesFor(key, profile, slot.short || busy),
    };
  };

  const placed = kept.map((key, i) => makeSession(key, best.assignment[i], slots[best.assignment[i]]));

  // Fold the main lifts from sessions that didn't fit into the closest match that did.
  for (const key of dropped) {
    if (!placed.length) break;
    const overlap = (s) => sessionInfo(key).groups.filter((g) => sessionInfo(s.key).groups.includes(g)).length;
    const target = placed.slice().sort((a, b) => overlap(b) - overlap(a) || a.day - b.day)[0];
    const have = new Set(target.exercises.map((x) => x.move));
    const pool = exercisesFor(key, profile, true);
    const extra = (isCustom(key) ? pool : pool.filter((x) => PRIMARY.has(x.move))).filter((x) => !have.has(x.move)).slice(0, 2);
    target.exercises.push(...extra.map((x) => ({ ...x, from: key })));
    target.notes.push(`Includes key lifts from ${sessionInfo(key).name}`);
    target.merged = [...(target.merged || []), key];
  }

  if (!replanning && available.length < keys.length) {
    warnings.push({
      kind: 'capacity',
      text: `Only ${available.length} day${available.length === 1 ? ' has' : 's have'} free time for training, so this week has ${available.length} session${available.length === 1 ? '' : 's'} instead of ${keys.length}.`,
    });
  } else if (dropped.length && placed.length) {
    warnings.push({ kind: 'merged', text: `Not enough days left for ${dropped.map((k) => sessionInfo(k).name).join(' and ')}, so the main lifts moved into another session.` });
  }
  if (!placed.length && dropped.length) {
    warnings.push({ kind: 'none', text: `No free time left this week for ${dropped.map((k) => sessionInfo(k).name).join(' or ')}. Pick it up next week.` });
  }

  for (const s of placed) {
    const legs = sessionInfo(s.key).legs;
    const today = sport[s.day];
    const tomorrow = sport[(s.day + 1) % 7];
    if (legs === 'heavy' && today && today.intensity === 'hard')
      warnings.push({ kind: 'legs', text: `${s.name} lands on the same day as ${today.label || 'hard sport'}. There was no better day free; keep the leg work light.` });
    else if (legs === 'heavy' && tomorrow && tomorrow.intensity === 'hard')
      warnings.push({ kind: 'legs', text: `${s.name} is the day before ${tomorrow.label || 'hard sport'}. There was no better day free; go easy on volume.` });
  }
  const all = [...fixed, ...placed].sort((a, b) => a.day - b.day);
  for (const [a, b] of hardRuns(all, sport)) {
    if (b < fromDay) continue;
    warnings.push({ kind: 'run', text: `${b - a + 1} hard days in a row, ${DAYS_SHORT[a]} to ${DAYS_SHORT[b]}. Keep ${DAYS[b]} lighter if you feel flat.` });
  }

  return { sessions: placed.sort((a, b) => a.day - b.day), dropped, warnings, split: keys };
}

// ---------- streaks ----------
// A week counts when completed gym sessions, plus up to one sport session, reach the target.
export function weekMet(entry, target, sportCredit) {
  const done = entry ? entry.done.length : 0;
  return done + Math.min(1, sportCredit) >= target;
}

// target: a number, or a function of the week key (busy weeks have a lower target).
export function streakInfo(history, currentKey, target, sportCreditFor) {
  const targetFor = typeof target === 'function' ? target : () => target;
  const met = (k) => weekMet(history[k], targetFor(k), sportCreditFor(k));
  let current = 0;
  let k = addWeeks(currentKey, -1);
  while (history[k] && met(k)) { current++; k = addWeeks(k, -1); }
  const thisWeek = met(currentKey);
  if (thisWeek) current++;

  const keys = Object.keys(history).sort();
  let longest = 0;
  if (keys.length) {
    let run = 0;
    let w = keys[0];
    while (w <= currentKey) {
      if (history[w] && met(w)) { run++; longest = Math.max(longest, run); }
      else if (w !== currentKey) run = 0;
      w = addWeeks(w, 1);
    }
  }
  return { current, longest: Math.max(longest, current), thisWeekMet: thisWeek };
}
