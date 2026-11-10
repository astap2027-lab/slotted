import {
  DAYS, DAYS_SHORT, planWeek, weekKey, weekType, keyToDate, fmtTime, toMin, toHHMM, streakInfo, SPLIT_NAMES, SPLITS, SESSIONS,
  busyCount, sessionKeysFor, moveName, weeksBetween, addWeeks, sessionInfo, GROUPS, exercisesFor, freeGaps, bestSlot,
  exerciseLibrary, setCustomRoutine, rememberExerciseNames, customExerciseNames, routineKeys, exerciseKey,
} from './scheduler.js';
import { collectHistory, summarise } from './progress.js';
import { QUESTIONS, EXTRAS, readiness, adjustment, applyAdjustment, extrasText } from './readiness.js';
import { askCoach, formatReply, STARTERS } from './coach.js';
import {
  weekBlocks, windowFor, dayWindows, parseAvailability, validateChange, applyChanges, describeChange, touchesFixed,
  timetableContext, askTimetable, BLOCK_TYPES, planWithFlex, appliesTo, SPORT_EFFORTS, sportEffort, photoChanges, PHOTO_MAX_IMAGES,
} from './timetable.js';
import { proposeChanges, applyProposal } from './adjust.js';
import { load, save, exportJSON, importJSON, reset, defaultState } from './store.js';
import { mergeStates, forUpload } from './sync.js';
import { computeFreshness, freshnessLevel, LEVEL_LABELS, musclesFor, MUSCLES, PARTS, EFFORT, MAP_GROUPS } from './freshness.js';
import { FRONT, BACK } from './anatomy.js';
import { restSeconds, platesPerSide, warmupSets, usesBarbell, alternatives, weekRecap, PLATES } from './workout.js';
import {
  setMoveResolver, setCustomExercises, exerciseForMove, findExercise, exerciseById, searchExercises, alternativesFor,
  similarExercises, suggestMapping, validateExercise, allExercises, MUSCLE_INFO, MUSCLE_GROUPS, EQUIPMENT, CATEGORIES,
  TRACKS, LOADS, EXERCISE_TYPES, exerciseTypes, trackOf, equipmentFits, ROLE_WEIGHT,
} from './exercises.js';
import { unitLabel, fromKg, toKg, barFor, platesFor, weightStep, warmupOptions } from './units.js';
import {
  fieldsFor, hasWeight, weightLabel, FIELD_LABEL, normSet, newBest, bestText, suggestSet, setsText, setText,
  chartValue, chartCaption, kindUnit, fmtDuration,
} from './tracking.js';
import {
  weekStats, consistency, missedSessions, sessionsSince, completedWorkouts, personalRecords, recentPRs,
  muscleSets, muscleWork, hoursUntilFresh, partWork, partVolume,
} from './stats.js';

let state = load();
let editingWeek = 'A';
const app = document.getElementById('app');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const commit = () => {
  state.updatedAt = Date.now();
  if (!save(state)) toast('Couldn’t save on this device. Check your browser storage settings.');
  schedulePush();
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

const today = () => new Date();
const currentWeek = () => weekKey(today());
const typeOf = (key) => (state.useAB ? weekType(key, state.abAnchor) : 'A');
// Commitments that apply in a week: its template (A or B), repeats every few weeks, and one-off changes.
const blocksFor = (key) => weekBlocks(state, key);
const winFor = (key, day) => windowFor(state, key, day);
const templateSport = (key) => blocksFor(key).filter((b) => b.type === 'sport').length;
const sportCredit = (key) => templateSport(key) + (key === currentWeek() ? stravaFor(key).length : 0);
const todayIndex = () => (today().getDay() + 6) % 7;
const units = () => (state.units === 'lb' ? 'lb' : 'kg');
const wt = (kg) => fromKg(kg, units()); // stored kg -> shown number
// Load the user's own exercises into the library, and tell it how stored keys map to names.
function loadLibrary() {
  setMoveResolver((m) => moveName(m, state.profile.equipment));
  setCustomExercises(state.customExercises);
}
// The library record and tracking type for an exercise in a session (unknown ones log weight and reps).
const libFor = (x) => exerciseForMove(x.move, x.name);
const trackFor = (x) => trackOf(libFor(x));

function fmtDate(d) {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ---------- theme ----------
// Dark by default. Light, or matching the device, can be picked in Settings.
const systemLight = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = state.theme || 'dark';
  const resolved = t === 'system' ? (systemLight.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f2f3ef' : '#101214');
}
if (systemLight.addEventListener) systemLight.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });

// ---------- icons and shared bits ----------
const ICONS = {
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  photo: '<rect x="3.5" y="6.5" width="17" height="12.5" rx="2.5"/><path d="M8.5 6.5 10 4.5h4l1.5 2"/><circle cx="12" cy="12.8" r="3.2"/>',
  spark: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6"/>',
};
const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const BRAND = `<span class="setup-brand"><svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect x="1.5" y="1.5" width="23" height="23" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6" y="6" width="5" height="14" rx="1.5" fill="#c5f23d"/><rect x="13.5" y="6" width="5" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2"/></svg><span class="brand-name">Slotted</span></span>`;
const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.id, m.label]));
const fmtNum = (n) => Math.round(n).toLocaleString('en-AU');
const fmtK = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const subnav = (cur) => `<nav class="subnav" aria-label="Training">${[['plan', 'This week'], ['week', 'My week'], ['routine', 'Routine'], ['library', 'Library']]
  .map(([v, t]) => `<a href="#${v}" ${v === cur ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;

// Ask the coach a question from anywhere: opens the Coach and sends it.
let pendingCoachQ = null;
function askCoachAbout(q) {
  pendingCoachQ = q;
  if ((location.hash || '').startsWith('#coach')) renderCoach();
  else location.hash = '#coach';
}
const askBtn = (q, label = q) => `<button type="button" class="ask" data-ask="${esc(q)}">${icon('spark')}${esc(label)}</button>`;
function wireAsk(root = app) {
  root.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => askCoachAbout(b.dataset.ask)));
}

// ---------- routing ----------
// #home is the landing page. Training holds This week, My week and Routine; #workout/<session> is the focused workout.
const NAV_OF = { home: 'home', plan: 'training', week: 'training', routine: 'training', library: 'training', workout: 'training', progress: 'progress', coach: 'coach', profile: 'profile' };
let routeArgs = [];
let currentView = 'home';
const viewName = () => ((location.hash || '#home').slice(1).split('/')[0] || 'home');

function route() {
  const parts = (location.hash || '#home').slice(1).split('/');
  let view = parts[0] || 'home';
  routeArgs = parts.slice(1).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (!state.setupDone) view = 'setup';
  else if (view === 'setup') view = 'home';
  currentView = view;
  document.body.classList.toggle('setup', view === 'setup');
  document.body.classList.toggle('focus', view === 'workout');
  if (view !== 'workout') { clearInterval(elapsedTimer); clearInterval(holdTick); }
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === NAV_OF[view]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const views = {
    setup: renderSetup, home: renderHome, plan: renderPlan, week: renderWeek, routine: renderRoutine, library: renderLibrary,
    workout: renderWorkout, progress: renderProgress, coach: renderCoach, profile: renderSettings,
  };
  (views[view] || renderHome)();
  renderSideWeek();
}
window.addEventListener('hashchange', () => {
  route();
  app.classList.remove('enter');
  void app.offsetWidth;
  app.classList.add('enter');
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

// The sidebar's small "this week" summary on desktop.
function renderSideWeek() {
  const el = document.getElementById('side-week');
  if (!el) return;
  if (!state.setupDone) { el.innerHTML = ''; return; }
  const ctx = weekCtx();
  const streak = streakInfo(state.history, ctx.key, targetFor, sportCredit);
  const pct = ctx.target ? Math.round((ctx.counted / ctx.target) * 100) : 0;
  el.innerHTML = `<span class="label">This week</span>
    <b>${ctx.counted} of ${plural(ctx.target, 'session')}</b>
    <div class="meter" aria-hidden="true"><i style="--w:${pct}%"></i></div>
    <span class="label">${streak.current ? `${plural(streak.current, 'week')} in a row` : 'Hit your target to start a streak'}</span>`;
}

// ---------- profile form (settings) ----------
function chip(name, value, label, checked, sub = '', type = 'radio') {
  return `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
}

const setSelect = (name, label, options, value, hint = '') => `
  <div class="setrow">
    <label for="set-${name}"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</label>
    <select id="set-${name}" name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
  </div>`;

const restDayPicker = (selected) => `<div class="daypick" role="group" aria-label="Rest days">${DAYS_SHORT.map((n, d) => chip('restDays', d, n, (selected || []).includes(d), '', 'checkbox')).join('')}</div>`;

function profileFields() {
  const p = state.profile;
  const thisType = state.useAB ? weekType(currentWeek(), state.abAnchor) : 'A';
  return `
  <section class="set-section">
    <h2>Profile</h2>
    <div class="setrows">
      <div class="setrow">
        <label for="set-name"><span>Your name</span><small>Used to greet you on Home</small></label>
        <input id="set-name" name="name" type="text" maxlength="40" autocomplete="given-name" value="${esc(state.name || '')}" placeholder="First name">
      </div>
    </div>
  </section>
  <section class="set-section" style="margin-top:26px">
    <h2>Training</h2>
    <div class="setrows">
      ${setSelect('goal', 'Goal', [['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['sport', 'Perform better at sport'], ['fitness', 'General fitness']], p.goal)}
      ${setSelect('level', 'Experience', [['beginner', 'Under a year'], ['intermediate', '1 to 3 years'], ['advanced', 'More than 3 years']], p.level)}
      ${setSelect('equipment', 'Where you train', [['gym', 'A full gym'], ['home', 'Home gym'], ['bodyweight', 'No equipment']], p.equipment)}
      ${setSelect('sessionsPerWeek', 'Weekly target', [2, 3, 4, 5, 6].map((n) => [n, usingCustom() ? `${n} sessions` : `${n} sessions, ${SPLIT_NAMES[n].toLowerCase()}`]), p.sessionsPerWeek, 'Gym sessions, not counting sport')}
      ${setSelect('sessionLength', 'Session length', [45, 60, 75, 90].map((n) => [n, `${n} minutes`]), p.sessionLength)}
      ${setSelect('timeOfDay', 'Preferred time', [['afternoon', 'After school (3 to 6pm)'], ['morning', 'Mornings (7 to 9am)'], ['evening', 'Evenings (after 6pm)']], p.timeOfDay || 'afternoon', 'Slotted uses other times only when this one is taken')}
      <div class="setrow">
        <span class="lbl">Rest days<small>Slotted won’t plan sessions on these days</small></span>
        ${restDayPicker(state.restDays)}
      </div>
      ${setSelect('useAB', 'School timetable', [['no', 'Same every week'], ['yes', 'Week A and Week B']], state.useAB ? 'yes' : 'no')}
      <div class="abwhich" ${state.useAB ? '' : 'hidden'}>
        ${setSelect('thisWeek', 'This week is', [['A', 'Week A'], ['B', 'Week B']], thisType)}
      </div>
    </div>
  </section>
  <section class="set-section" style="margin-top:26px">
    <h2>Workouts</h2>
    <div class="setrows">
      ${setSelect('restMode', 'Rest timer', [['sound', 'On, with a beep'], ['silent', 'On, silent'], ['off', 'Off']], state.restMode || 'sound', 'Starts when you tick a set')}
      ${setSelect('barKg', 'Barbell', [[20, `${barFor(units(), 20)} ${unitLabel(units())} bar`], [15, `${barFor(units(), 15)} ${unitLabel(units())} bar`]], state.barKg || 20, 'For plates and warm-ups')}
    </div>
  </section>`;
}

function readProfile(form) {
  const f = new FormData(form);
  state.profile = {
    goal: f.get('goal'),
    level: f.get('level'),
    equipment: f.get('equipment'),
    sessionsPerWeek: Number(f.get('sessionsPerWeek')),
    sessionLength: Number(f.get('sessionLength')),
    timeOfDay: f.get('timeOfDay') || 'afternoon',
  };
  state.name = String(f.get('name') || '').trim().slice(0, 40);
  state.restDays = f.getAll('restDays').map(Number);
  state.useAB = f.get('useAB') === 'yes';
  if (f.get('restMode')) state.restMode = f.get('restMode');
  if (f.get('barKg')) state.barKg = Number(f.get('barKg'));
  state.abAnchor = state.useAB ? { week: currentWeek(), type: f.get('thisWeek') || 'A' } : null;
}

function wireAB(form) {
  form.addEventListener('change', (e) => {
    if (e.target.name === 'useAB') form.querySelector('.abwhich').hidden = e.target.value !== 'yes';
  });
}

// ---------- setup ----------
// One question per screen. Single-choice answers move on by themselves.
let setupStep = 0;
let draft = null;
const SETUP_STEPS = [
  { id: 'goal', q: 'What are you training for?', options: [
    ['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['sport', 'Perform better at sport'], ['fitness', 'General fitness']] },
  { id: 'level', q: 'How long have you been lifting?', options: [
    ['beginner', 'Under a year'], ['intermediate', '1 to 3 years'], ['advanced', 'More than 3 years']] },
  { id: 'equipment', q: 'Where do you train?', options: [
    ['gym', 'A full gym'], ['home', 'Home gym', 'Dumbbells, bench, pull-up bar'], ['bodyweight', 'No equipment', 'Bodyweight exercises']] },
  { id: 'routine', q: 'Do you already follow a routine?', options: [
    ['suggested', 'Suggest one for me', 'Built from your goal and equipment'], ['custom', 'I have my own', 'Enter it next, or start from a template']] },
  { id: 'sessionsPerWeek', q: 'How many gym sessions a week?', hint: 'Not counting sport. Slotted plans around it.', options: [
    [2, '2 sessions'], [3, '3 sessions'], [4, '4 sessions'], [5, '5 sessions'], [6, '6 sessions']] },
  { id: 'sessionLength', q: 'How long is a session?', options: [
    [45, '45 minutes'], [60, '60 minutes'], [75, '75 minutes'], [90, '90 minutes']] },
  { id: 'timeOfDay', q: 'When do you like to train?', hint: 'Slotted uses other times only when this one is taken.', options: [
    ['afternoon', 'After school', '3 to 6pm'], ['morning', 'Mornings', '7 to 9am, before school'], ['evening', 'Evenings', 'After 6pm']] },
  { id: 'ab', q: 'Does your school timetable change week to week?', options: [
    ['same', 'Same every week'], ['A', 'Week A and Week B', 'And this week is Week A'], ['B', 'Week A and Week B', 'And this week is Week B']] },
];

function welcomeBoard() {
  // A tiny week: school and sport first, then training drops into the gaps.
  const cols = [
    [['school', 15, 50], ['train', 70, 18, 0]],
    [['school', 15, 50], ['sport', 70, 14], ['train', 86, 12, 1]],
    [['school', 15, 50], ['other', 70, 20]],
    [['school', 15, 50], ['train', 70, 18, 2]],
    [['school', 15, 50]],
    [['sport', 20, 18], ['train', 64, 18, 3]],
  ];
  return `<div class="mini-board" aria-hidden="true">${cols.map((c, i) => `
    <div class="mb-col"><span class="mb-day">${DAYS_SHORT[i].slice(0, 1)}</span><div class="mb-track">
      ${c.map(([t, top, h, n]) => `<i class="mb-blk ${t}" style="top:${top}%;height:${h}%${n !== undefined ? `;--d:${0.5 + n * 0.25}s` : ''}"></i>`).join('')}
    </div></div>`).join('')}</div>`;
}

function renderSetup() {
  if (!draft) {
    draft = { ...state.profile, routine: 'suggested', ab: 'same' };
  }
  if (setupStep === 0) {
    app.innerHTML = `
    <section class="welcome">
      ${BRAND}
      ${welcomeBoard()}
      <h1>Training that fits your actual week</h1>
      <p class="lead">Tell Slotted when you have school, sport and everything else. It fits your gym sessions into the gaps, keeps leg days away from game days, and reshuffles when your week changes.</p>
      <div class="actions"><button type="button" class="primary big" id="start">Get started</button><span class="muted small">Takes about a minute</span></div>
    </section>`;
    document.getElementById('start').addEventListener('click', () => { setupStep = 1; renderSetup(); });
    return;
  }
  const step = SETUP_STEPS[setupStep - 1];
  const total = SETUP_STEPS.length;
  const current = step.id === 'ab' ? (draft.ab || 'same') : draft[step.id];
  const subFor = (val, sub) => (step.id === 'sessionsPerWeek' && draft.routine === 'suggested' ? SPLIT_NAMES[val] : sub);
  app.innerHTML = `
  <section class="wizard">
    ${BRAND}
    <div class="wz-top">
      <button type="button" class="ghost" id="wz-back">Back</button>
      <div class="wz-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${setupStep}" aria-label="Step ${setupStep} of ${total}"><i style="width:${(setupStep / total) * 100}%"></i></div>
      <span class="small muted">${setupStep} of ${total}</span>
    </div>
    <h1 id="wz-q">${esc(step.q)}</h1>
    ${step.hint ? `<p class="muted">${esc(step.hint)}</p>` : ''}
    <div class="wz-options" role="radiogroup" aria-labelledby="wz-q">
      ${step.options.map(([val, label, sub]) => {
        const s = subFor(val, sub);
        return `<button type="button" role="radio" class="wz-opt" data-val="${esc(val)}" aria-checked="${String(current) === String(val)}">
          <span>${esc(label)}</span>${s ? `<small>${esc(s)}</small>` : ''}
        </button>`;
      }).join('')}
    </div>
  </section>`;
  document.getElementById('wz-back').addEventListener('click', () => { setupStep -= 1; renderSetup(); });
  app.querySelectorAll('.wz-opt').forEach((b) => b.addEventListener('click', () => {
    const raw = b.dataset.val;
    draft[step.id] = /^\d+$/.test(raw) ? Number(raw) : raw;
    app.querySelectorAll('.wz-opt').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    setTimeout(() => {
      if (setupStep < total) { setupStep += 1; renderSetup(); app.querySelector('.wz-opt')?.focus(); }
      else finishSetup();
    }, 180);
  }));
  const chosen = app.querySelector('.wz-opt[aria-checked="true"]') || app.querySelector('.wz-opt');
  if (chosen && document.activeElement === document.body) chosen.focus({ preventScroll: true });
}

function finishSetup() {
  const { goal, level, equipment, sessionsPerWeek, sessionLength, timeOfDay } = draft;
  state.profile = { goal, level, equipment, sessionsPerWeek, sessionLength, timeOfDay: timeOfDay || 'afternoon' };
  state.useAB = draft.ab === 'A' || draft.ab === 'B';
  state.abAnchor = state.useAB ? { week: currentWeek(), type: draft.ab } : null;
  const own = draft.routine === 'custom';
  if (own) { state.routine.mode = 'custom'; state.routine.startWeek = currentWeek(); syncRoutine(); }
  state.setupDone = true;
  draft = null; setupStep = 0;
  commit();
  location.hash = own ? '#routine' : '#week';
  route();
}

// ---------- my week ----------
const TYPE_LABEL = { sport: 'Sport', school: 'School', work: 'Work', other: 'Other' };

// The workouts this person rotates through, from their own routine or the suggested split.
function splitSummary() {
  if (usingCustom()) {
    return state.routine.workouts.filter((w) => w.exercises.some((e) => e.name)).map((w) => ({
      name: w.name || 'Workout', exercises: w.exercises.filter((e) => e.name).map((e) => e.name),
    }));
  }
  const seen = new Set();
  return (SPLITS[state.profile.sessionsPerWeek] || SPLITS[3]).filter((k) => !seen.has(SESSIONS[k].name) && seen.add(SESSIONS[k].name))
    .map((k) => ({ name: SESSIONS[k].name, exercises: exercisesFor(k, state.profile).map((x) => x.name) }));
}

// ---------- My week: commitment details ----------
let editingBlock = null; // id of the commitment being edited
const MINS = [0, 10, 15, 20, 30, 45, 60];
const blockTags = (b) => [
  b.flex ? 'Flexible' : '',
  b.before || b.after ? `${[b.before ? `${b.before} min before` : '', b.after ? `${b.after} min after` : ''].filter(Boolean).join(', ')}` : '',
  Number(b.every) > 1 ? `Every ${b.every} weeks${b.anchor && appliesThisWeek(b) ? ', on this week' : b.anchor ? ', off this week' : ''}` : '',
].filter(Boolean).map((t) => ` <b class="tag">${esc(t)}</b>`).join('');
const appliesThisWeek = (b) => appliesTo(b, currentWeek());

// Flexible, travel or preparation time, and how often it repeats. Used when adding and editing.
function blockExtras(b) {
  const sel = (name, label, opts, v) => `<div class="field"><label for="x-${name}-${b.id || 'new'}">${label}</label><select id="x-${name}-${b.id || 'new'}" name="${name}">${opts.map(([val, t]) => `<option value="${val}" ${Number(v || 0) === val || (!v && val === opts[0][0]) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  const mins = MINS.map((m) => [m, m ? `${m} min` : 'None']);
  return `<details class="blockextras"${b.flex || b.before || b.after || Number(b.every) > 1 ? ' open' : ''}>
    <summary>More options: flexible, travel time, repeats</summary>
    <label class="chip"><input type="checkbox" name="flex" value="1" ${b.flex ? 'checked' : ''}><span>Flexible<small>Can give way when a week is too full to fit your sessions. Fixed ones never do.</small></span></label>
    <div class="row">
      ${sel('before', 'Travel or prep before', mins, b.before)}
      ${sel('after', 'Travel after', mins, b.after)}
      ${sel('every', 'Repeats', [[1, 'Every week'], [2, 'Every 2 weeks'], [3, 'Every 3 weeks'], [4, 'Every 4 weeks']], b.every || 1)}
    </div>
  </details>`;
}
function readExtras(f, old = {}) {
  const every = Number(f.get('every')) || 1;
  return {
    ...(f.get('flex') ? { flex: true } : {}),
    ...(Number(f.get('before')) ? { before: Number(f.get('before')) } : {}),
    ...(Number(f.get('after')) ? { after: Number(f.get('after')) } : {}),
    ...(every > 1 ? { every, anchor: old.every === every && old.anchor ? old.anchor : currentWeek() } : {}),
  };
}

function blockEditor(b) {
  return `<form class="blockedit stack" data-editform="${b.id}" novalidate>
    <div class="row">
      <div class="field"><label for="e-label">What is it?</label><input id="e-label" name="label" type="text" value="${esc(b.label)}"></div>
      <div class="field"><label for="e-type">Type</label><select id="e-type" name="type">${Object.entries(BLOCK_TYPES).map(([k, v]) => `<option value="${k}" ${b.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label for="e-day">Day</label><select id="e-day" name="day">${DAYS.map((n, d) => `<option value="${d}" ${b.day === d ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label for="e-start">From</label><input id="e-start" name="start" type="time" value="${b.start}"></div>
      <div class="field"><label for="e-end">To</label><input id="e-end" name="end" type="time" value="${b.end}"></div>
    </div>
    <div class="field" ${b.type === 'sport' ? '' : 'hidden'} data-eint><label for="e-int">How hard is it?</label><select id="e-int" name="intensity">${Object.entries(SPORT_EFFORTS).map(([k, v]) => `<option value="${k}" ${sportEffort(b.intensity) === k ? 'selected' : ''}>${v.label} (${v.sub.toLowerCase()})</option>`).join('')}</select></div>
    ${blockExtras(b)}
    <p class="errors" role="alert"></p>
    <div class="actions"><button type="submit" class="primary">Save</button><button type="button" class="ghost" data-editcancel>Cancel</button></div>
  </form>`;
}

// One-off changes for this week and next, each with an undo.
function oneOffCard() {
  const key = currentWeek();
  const rows = [];
  for (const wk of [key, addWeeks(key, 1)]) {
    const e = state.history[wk] || {};
    const label = wk === key ? 'this' : 'next';
    const tpl = state.blocks[typeOf(wk)] || [];
    for (const b of e.extra || []) rows.push([`${b.label}, ${label} ${DAYS[b.day]} ${fmtTime(toMin(b.start))} to ${fmtTime(toMin(b.end))}${b.from ? ' (changed time)' : ''}`, `extra|${wk}|${b.id}`]);
    for (const id of e.hidden || []) {
      const b = tpl.find((x) => x.id === id);
      const changed = (e.extra || []).some((x) => x.from === id);
      if (b && !changed) rows.push([`No ${b.label} ${label} ${DAYS[b.day]}`, `hidden|${wk}|${id}`]);
    }
    for (const d of e.skipDays || []) rows.push([`No training ${label} ${DAYS[d]}`, `skip|${wk}|${d}`]);
    for (const [d, w] of Object.entries(e.windows || {})) rows.push([`Training hours ${label} ${DAYS[d]}: ${fmtTime(toMin(w.start))} to ${fmtTime(toMin(w.end))}`, `win|${wk}|${d}`]);
  }
  if (!rows.length) return '';
  return `<section class="card stack">
    <h2>Just this week and next</h2>
    <p class="muted small">One-off changes. Your usual week stays as it is.</p>
    <ul class="oneoffs">${rows.map(([t, id]) => `<li><span>${esc(t)}</span><button type="button" class="ghost" data-undo="${esc(id)}">Undo</button></li>`).join('')}</ul>
  </section>`;
}

function wireWeekExtras() {
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    editingBlock = editingBlock === b.dataset.edit ? null : b.dataset.edit;
    renderWeek();
  }));
  app.querySelectorAll('[data-editcancel]').forEach((b) => b.addEventListener('click', () => { editingBlock = null; renderWeek(); }));
  app.querySelectorAll('[data-editform]').forEach((form) => {
    form.querySelector('[name=type]').addEventListener('change', (e) => { form.querySelector('[data-eint]').hidden = e.target.value !== 'sport'; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const list = state.blocks[editingWeek];
      const i = list.findIndex((x) => x.id === form.dataset.editform);
      if (i < 0) return;
      const old = list[i];
      const start = f.get('start');
      const end = f.get('end');
      if (!start || !end || toMin(end) <= toMin(start)) { form.querySelector('.errors').textContent = 'The finish time needs to be after the start time.'; return; }
      const type = f.get('type');
      const { flex, before, after, every, anchor, intensity, ...keep } = old;
      list[i] = {
        ...keep, label: (f.get('label') || '').trim() || BLOCK_TYPES[type], type, day: Number(f.get('day')), start, end,
        ...(type === 'sport' ? { intensity: f.get('intensity') } : {}), ...readExtras(f, old),
      };
      editingBlock = null;
      commit(); renderWeek();
      toast(`${list[i].label} saved`);
    });
  });
  app.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => {
    const [kind, wk, id] = b.dataset.undo.split('|');
    const e = state.history[wk];
    if (!e) return;
    if (kind === 'extra') {
      const x = (e.extra || []).find((y) => y.id === id);
      e.extra = (e.extra || []).filter((y) => y.id !== id);
      if (x && x.from) e.hidden = (e.hidden || []).filter((h) => h !== x.from);
    }
    if (kind === 'hidden') e.hidden = (e.hidden || []).filter((h) => h !== id);
    if (kind === 'skip') e.skipDays = (e.skipDays || []).filter((d) => d !== Number(id));
    if (kind === 'win' && e.windows) delete e.windows[id];
    commit(); renderWeek(); toast('Undone');
  }));
  app.querySelectorAll('[data-dw]').forEach((inp) => inp.addEventListener('change', () => {
    const d = inp.dataset.dw.split('|')[0];
    const st = document.getElementById(`dw-s-${d}`).value;
    const en = document.getElementById(`dw-e-${d}`).value;
    state.dayWindows = { ...(state.dayWindows || {}) };
    if (!st && !en) delete state.dayWindows[d];
    else {
      const w = { start: st || state.window.start, end: en || state.window.end };
      if (toMin(w.end) - toMin(w.start) < 60) { toast('Leave at least an hour between earliest and latest.'); return; }
      state.dayWindows[d] = w;
    }
    commit(); renderWeek(); toast(`Training hours saved for ${DAYS[d]}`);
  }));
  app.querySelectorAll('[data-dwclear]').forEach((b) => b.addEventListener('click', () => {
    state.dayWindows = { ...(state.dayWindows || {}) };
    delete state.dayWindows[b.dataset.dwclear];
    commit(); renderWeek();
  }));
}

function renderWeek() {
  if (!state.useAB) editingWeek = 'A';
  const blocks = state.blocks[editingWeek];
  const byDay = DAYS.map((_, d) => blocks.filter((b) => b.day === d).sort((a, b) => toMin(a.start) - toMin(b.start)));
  const hasSchool = blocks.some((b) => b.type === 'school');
  const rest = state.restDays || [];
  const split = splitSummary();

  app.innerHTML = `
  ${subnav('week')}
  <div class="page-head">
    <div>
      <h1>My week</h1>
      <p class="page-sub">Block out everything that isn’t the gym. Slotted fits your training into the gaps.</p>
    </div>
    ${state.useAB ? `<div class="seg" role="tablist" aria-label="Timetable week">
      ${['A', 'B'].map((w) => `<button type="button" role="tab" data-tab="${w}" aria-selected="${editingWeek === w}">Week ${w}</button>`).join('')}
    </div>` : ''}
  </div>
  <div class="grid2">
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Commitments${state.useAB ? `, Week ${editingWeek}` : ''}</h2></div>
        <div class="daylist">
          ${DAYS.map((name, d) => `
          <div class="dayrow">
            <b>${name}${rest.includes(d) ? '<small class="restday">Rest day</small>' : ''}</b>
            <div class="items">
              ${byDay[d].length ? byDay[d].map((b) => `
                <span class="item ${b.type}${b.flex ? ' flex' : ''}">
                  <button type="button" class="item-edit" data-edit="${b.id}" aria-expanded="${editingBlock === b.id}" aria-label="Edit ${esc(b.label)} on ${name}"><span>${esc(b.label)}, ${fmtTime(toMin(b.start))} to ${fmtTime(toMin(b.end))}${b.type === 'sport' && b.intensity === 'hard' && !/game|race|match/i.test(b.label) ? ' <b class="tag">Game</b>' : ''}${b.type === 'sport' && b.intensity === 'easy' ? ' <b class="tag">Easy</b>' : ''}${blockTags(b)}</span></button>
                  <button type="button" data-del="${b.id}" aria-label="Remove ${esc(b.label)} on ${name}">×</button>
                </span>`).join('') : '<span class="empty">Free</span>'}
            </div>
            ${byDay[d].some((b) => b.id === editingBlock) ? blockEditor(byDay[d].find((b) => b.id === editingBlock)) : ''}
          </div>`).join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Your training split</h2><a href="#routine">${usingCustom() ? 'Edit routine' : 'Use your own routine'}</a></div>
        <p class="muted small" style="margin-bottom:12px">${usingCustom() ? 'Your own routine, run in order and carried across weeks.' : `Slotted’s suggested plan: ${esc(SPLIT_NAMES[state.profile.sessionsPerWeek] || '')}.`} ${plural(state.profile.sessionsPerWeek, 'session')} a week.</p>
        ${split.length ? `<ul class="split-list">${split.map((w) => `<li><b>${esc(w.name)}</b><small>${esc(w.exercises.join(', '))}</small></li>`).join('')}</ul>`
          : '<p class="small">Add exercises to your routine to see your split here.</p>'}
      </section>
    </div>
    <div class="stack">
      ${availHtml()}
      ${oneOffCard()}
      ${hasSchool ? '' : `
      <section class="card stack">
        <h2>Start with school</h2>
        <div class="row">
          <div class="field"><label for="sch-start">Starts</label><input id="sch-start" type="time" value="08:30"></div>
          <div class="field"><label for="sch-end">Finishes</label><input id="sch-end" type="time" value="15:10"></div>
        </div>
        <button type="button" id="add-school">Add school, Monday to Friday</button>
      </section>`}
      <form class="card" id="addform" novalidate>
        <h2>Add a commitment</h2>
        <div class="field"><label for="label">What is it?</label><input id="label" name="label" type="text" placeholder="Basketball, cadets, part-time job" autocomplete="off"></div>
        <fieldset>
          <legend>Type</legend>
          <div class="chips">
            ${chip('type', 'sport', 'Sport', true)}
            ${chip('type', 'school', 'School', false)}
            ${chip('type', 'work', 'Work', false)}
            ${chip('type', 'other', 'Something else', false)}
          </div>
        </fieldset>
        <fieldset id="intensity">
          <legend>How hard is it?</legend>
          <p class="hint" style="margin:0 0 8px">Slotted keeps leg sessions away from games, a little away from training, and ignores easy sessions.</p>
          <div class="chips">
            ${Object.entries(SPORT_EFFORTS).map(([k, v]) => chip('intensity', k, v.label, k === 'light', v.sub)).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Which days?</legend>
          <div class="chips days">${DAYS_SHORT.map((n, d) => chip('days', d, n, false, '', 'checkbox')).join('')}</div>
        </fieldset>
        <div class="row">
          <div class="field"><label for="start">From</label><input id="start" name="start" type="time" value="16:00"></div>
          <div class="field"><label for="end">To</label><input id="end" name="end" type="time" value="17:30"></div>
        </div>
        ${blockExtras({})}
        ${state.useAB ? `<label class="chip"><input type="checkbox" name="both" value="1" checked><span>Same in Week A and Week B</span></label>` : ''}
        <p class="errors" id="adderr" role="alert"></p>
        <button class="primary" type="submit">Add commitment</button>
      </form>
      <section class="card stack">
        <h2>Training hours</h2>
        <p class="muted small">The earliest and latest you’re happy to be at the gym.</p>
        <div class="row">
          <div class="field"><label for="win-start">Earliest start</label><input id="win-start" type="time" value="${state.window.start}"></div>
          <div class="field"><label for="win-end">Latest finish</label><input id="win-end" type="time" value="${state.window.end}"></div>
        </div>
        <details class="daywins"${Object.keys(state.dayWindows || {}).length ? ' open' : ''}>
          <summary>Different hours on some days</summary>
          <p class="muted small">Leave a day blank to use the times above.</p>
          ${DAYS.map((n, d) => { const w = (state.dayWindows || {})[d] || {}; return `<div class="daywin"><span>${DAYS_SHORT[d]}</span>
            <label class="sr" for="dw-s-${d}">${n} earliest start</label><input id="dw-s-${d}" type="time" data-dw="${d}|start" value="${w.start || ''}">
            <label class="sr" for="dw-e-${d}">${n} latest finish</label><input id="dw-e-${d}" type="time" data-dw="${d}|end" value="${w.end || ''}">
            ${w.start ? `<button type="button" class="ghost" data-dwclear="${d}" aria-label="Use the usual hours on ${n}">Clear</button>` : ''}</div>`; }).join('')}
        </details>
      </section>
      <section class="card stack">
        <h2>Rest days</h2>
        <p class="muted small">Days you’d rather not train. Slotted plans around them every week.</p>
        <form id="restform">${restDayPicker(rest)}</form>
      </section>
      <a class="btn primary big" href="#plan">See this week’s plan</a>
    </div>
  </div>`;

  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { editingWeek = b.dataset.tab; editingBlock = null; renderWeek(); }));
  wireAvail(renderWeek);
  wireWeekExtras();
  app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    state.blocks[editingWeek] = state.blocks[editingWeek].filter((x) => x.id !== b.dataset.del);
    commit(); renderWeek();
  }));

  const schoolBtn = document.getElementById('add-school');
  if (schoolBtn) schoolBtn.addEventListener('click', () => {
    const s = document.getElementById('sch-start').value;
    const e = document.getElementById('sch-end').value;
    if (!s || !e || toMin(e) <= toMin(s)) { toast('School needs to finish after it starts.'); return; }
    const weeks = state.useAB ? ['A', 'B'] : ['A'];
    for (const w of weeks) for (let d = 0; d < 5; d++)
      state.blocks[w].push({ id: uid(), day: d, start: s, end: e, type: 'school', label: 'School' });
    commit(); renderWeek();
    toast(state.useAB ? 'School added to Week A and Week B' : 'School added');
  });

  const form = document.getElementById('addform');
  const err = document.getElementById('adderr');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') document.getElementById('intensity').hidden = e.target.value !== 'sport';
    err.textContent = '';
  });
  form.addEventListener('input', () => { err.textContent = ''; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const days = f.getAll('days').map(Number);
    const type = f.get('type');
    const label = (f.get('label') || '').trim() || { sport: 'Sport', school: 'School', work: 'Work', other: 'Busy' }[type];
    const start = f.get('start');
    const end = f.get('end');
    if (!days.length) { err.textContent = 'Pick at least one day.'; return; }
    if (!start || !end || toMin(end) <= toMin(start)) { err.textContent = 'The finish time needs to be after the start time.'; return; }
    const weeks = state.useAB && f.get('both') ? ['A', 'B'] : [editingWeek];
    for (const w of weeks) for (const d of days) {
      state.blocks[w].push({
        id: uid(), day: d, start, end, type, label,
        ...(type === 'sport' ? { intensity: f.get('intensity') } : {}),
        ...readExtras(f),
      });
    }
    commit(); renderWeek();
    toast(`${label} added`);
  });

  ['win-start', 'win-end'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    const s = document.getElementById('win-start').value;
    const e = document.getElementById('win-end').value;
    if (!s || !e || toMin(e) - toMin(s) < 60) { toast('Leave at least an hour between earliest and latest.'); return; }
    state.window = { start: s, end: e };
    commit(); toast('Training hours saved');
  }));

  document.getElementById('restform').addEventListener('change', (e) => {
    state.restDays = new FormData(e.currentTarget).getAll('restDays').map(Number);
    commit(); renderWeek();
    toast(state.restDays.length ? `Rest days saved: ${state.restDays.map((d) => DAYS_SHORT[d]).join(', ')}` : 'No rest days set');
  });
}

// ---------- keeping data safe ----------
// Installed web apps keep their storage; on iPhone, a site left in Safari can be cleared after a week unused.
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (['plan', 'home'].includes(viewName())) route();
});
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installBanner() {
  if (isStandalone() || state.installDismissed || (!deferredInstall && !isIOS())) return '';
  return `<section class="install" aria-label="Add to home screen">
    <div>
      <b>Add Slotted to your home screen</b>
      <p class="small">${deferredInstall
        ? 'It opens like an app, works offline, and keeps your history safe.'
        : 'Tap the Share button, then Add to Home Screen. It opens like an app and stops Safari clearing your history.'}</p>
    </div>
    <div class="install-actions">
      ${deferredInstall ? '<button type="button" class="primary" id="install-btn">Add</button>' : ''}
      <button type="button" class="ghost" id="install-x" aria-label="Hide this">Not now</button>
    </div>
  </section>`;
}

function wireInstall() {
  const btn = document.getElementById('install-btn');
  if (btn) btn.addEventListener('click', async () => {
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch { /* ignore */ }
    deferredInstall = null; route();
  });
  const x = document.getElementById('install-x');
  if (x) x.addEventListener('click', () => { state.installDismissed = true; commit(); route(); });
}

function askToKeepData() {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((kept) => { if (!kept) navigator.storage.persist(); }).catch(() => {});
    }
  } catch { /* not supported */ }
}

// ---------- this week: stored plan + re-planning ----------
const nowMin = () => { const d = today(); return d.getHours() * 60 + d.getMinutes(); };
const targetFor = (key) => {
  const n = state.profile.sessionsPerWeek;
  return state.history[key] && state.history[key].busy ? busyCount(n) : n;
};
const routineWeek = (key) => (state.routine && state.routine.startWeek ? weeksBetween(state.routine.startWeek, key) : 0);
const keysFor = (key, busy) => (usingCustom()
  ? routineKeys(state.profile, state.routine, routineWeek(key), busy)
  : sessionKeysFor(state.profile, busy));
const keepOrder = () => !!(usingCustom() && state.routine.keepOrder);
const allSkip = (e) => [...new Set([...(e.skipDays || []), ...(state.restDays || [])])];
const planInputs = (key) => JSON.stringify({
  rest: state.restDays || [],
  r: usingCustom() ? state.routine : null,
  p: state.profile, b: blocksFor(key), w: state.window, dw: dayWindows(state, key),
  busy: !!(state.history[key] && state.history[key].busy),
  skip: (state.history[key] && state.history[key].skipDays) || [],
});

function entryFor(key) {
  if (!state.history[key]) state.history[key] = { done: [] };
  const e = state.history[key];
  e.done = e.done || [];
  e.skipDays = e.skipDays || [];
  e.shortKeys = e.shortKeys || [];
  return e;
}

// Plan the whole week the first time it's opened; after that only the rest of it is ever re-planned.
function ensurePlan(key) {
  const e = entryFor(key);
  const inputs = planInputs(key);
  if (!e.plan) {
    // A plan first made partway through the current week starts from today, so days already gone never show as missed.
    const midWeek = key === currentWeek() ? { fromDay: todayIndex(), nowMin: nowMin() } : {};
    const res = planWithFlex(state.profile, blocksFor(key), state.window, { busy: e.busy, skipDays: allSkip(e), keys: keysFor(key, e.busy), keepOrder: keepOrder(), dayWindows: dayWindows(state, key), ...midWeek });
    e.plan = res.sessions;
    e.warnings = res.warnings;
    e.inputs = inputs;
    commit();
  } else if (e.inputs !== inputs) {
    replan(key);
  }
  return e;
}

function replan(key, missedKey = null) {
  const e = entryFor(key);
  const tIdx = todayIndex();
  const now = nowMin();
  const fixed = e.plan.filter((s) => s.key !== missedKey && (
    s.pinned || s.locked || e.done.includes(s.key) || s.day < tIdx || (s.day === tIdx && s.start <= now)));
  const all = keysFor(key, e.busy);
  const target = all.length;
  const keys = all.filter((k) => !fixed.some((f) => f.key === k)).slice(0, Math.max(0, target - fixed.length));
  const res = planWithFlex(state.profile, blocksFor(key), state.window, {
    busy: e.busy, fixed, keys, fromDay: tIdx, nowMin: now, skipDays: allSkip(e), keepOrder: keepOrder(), dayWindows: dayWindows(state, key),
  });
  e.plan = [...fixed, ...res.sessions].sort((a, b) => a.day - b.day);
  e.warnings = res.warnings;
  e.inputs = planInputs(key);
  e.shortKeys = e.shortKeys.filter((k) => e.plan.some((s) => s.key === k));
  commit();
  return res;
}

// ---------- logging ----------
// Each set is { kg, reps, done }. Sets come pre-filled with a suggestion so logging is one tap.
function logFor(wk, sk) {
  state.log = state.log || {};
  state.log[wk] = state.log[wk] || {};
  state.log[wk][sk] = state.log[wk][sk] || {};
  return state.log[wk][sk];
}

const doneSets = (sets) => (sets || []).filter((x) => x && x.done);

// The most recent session (other than this one) where this exercise was logged.
function lastSets(move, wk, sk) {
  const weeks = Object.keys(state.log || {}).filter((w) => w <= wk).sort().reverse();
  for (const w of weeks) {
    const entries = Object.entries(state.log[w]).filter(([s]) => !(w === wk && s === sk));
    for (const [, moves] of entries) {
      const sets = doneSets(moves[move]);
      if (sets.length) return sets;
    }
  }
  return null;
}

// Every ticked set of a move, leaving out one session (or one set), normalised for its tracking type.
function setsOutside(move, track, skip = {}) {
  const out = [];
  for (const [w, sessions] of Object.entries(state.log || {})) {
    for (const [s, moves] of Object.entries(sessions)) {
      if (skip.whole && w === skip.w && s === skip.s) continue;
      (moves[move] || []).forEach((x, i) => {
        if (!x || !x.done) return;
        if (!skip.whole && skip.w === w && skip.s === s && skip.i === i) return;
        out.push(normSet(x, track));
      });
    }
  }
  return out;
}

// Assisted work improves with reps (less help is progress), so bests are judged on reps.
const bestTrack = (x) => (((libFor(x) || {}).load === 'assisted') ? 'reps' : trackFor(x));

// Suggest this time's numbers from last time, following the exercise's tracking type.
// Weights in the result are in the user's unit (they go straight into the boxes).
function suggestFor(x, wk, sk, factor = 1) {
  const lex = libFor(x);
  const track = trackOf(lex);
  const last = lastSets(x.move, wk, sk);
  const shown = last && last.map((y) => { const n = normSet(y, track); return { ...n, kg: Number(wt(n.kg)) || 0 }; });
  const step = lex && lex.load === 'assisted' ? 0 : weightStep(units(), state.profile.equipment);
  const res = { ...suggestSet(track, x.reps, shown, { sets: x.sets, step, units: units() }), last, track };
  if (factor === 1 || !res.kg) return res;
  const st = weightStep(units(), state.profile.equipment) || 0.5;
  return { ...res, kg: Math.max(st, Math.round((res.kg * factor) / st) * st), up: false, upText: '', lighter: true };
}

const fmtLast = (sets, track) => setsText(sets.map((y) => normSet(y, track)), track, units());

// ---------- sessions: shared helpers ----------
// Today's check-in for a session's day, and what it changes.
const checkinFor = (s) => { const e = state.history[currentWeek()]; return (e && e.checkins && e.checkins[s.day]) || null; };
const adjustFor = (s) => adjustment(checkinFor(s));
// A lighter session the user accepted from a suggestion. A check-in adjustment takes over if there is one.
const lightFor = (s) => { const e = state.history[currentWeek()]; return e && (e.lighten || []).includes(s.key) ? { setsMinus: 1, maxExercises: null, kgFactor: 0.9, note: 'Lighter session: one set less, about 10% lighter' } : null; };
const adjOf = (s) => adjustFor(s) || lightFor(s);
// Swapped exercises for this week: { [sessionKey]: { [originalMove]: newName } }
const swapsFor = (s) => { const e = state.history[currentWeek()]; return (e && e.swaps && e.swaps[s.key]) || {}; };
const applySwaps = (s, list) => {
  const sw = swapsFor(s);
  return list.map((x) => (sw[x.move] ? { ...x, move: exerciseKey(sw[x.move]), name: sw[x.move], orig: x.move, origName: x.name } : x));
};
// Exercises skipped for this session: [originalMove]
const skippedFor = (s) => { const e = state.history[currentWeek()]; return (e && e.skips && e.skips[s.key]) || []; };
const sessionExercises = (s, short) => {
  const list = short ? (s.exercises || []).slice(0, 3) : (s.exercises || []);
  return applyAdjustment(applySwaps(s, list), adjOf(s));
};
const shownExercises = (s, short) => {
  const skipped = skippedFor(s);
  return sessionExercises(s, short).filter((x) => !skipped.includes(x.orig || x.move));
};
const openTools = new Set(); // "swap|sk|move" or "warm|sk|move" panels that are open
let openMove = null; // session whose Move panel is open

// Everything a screen needs to know about this week.
function weekCtx() {
  const key = currentWeek();
  const entry = ensurePlan(key);
  const tIdx = todayIndex();
  const now = nowMin();
  const sessions = entry.plan;
  const isShort = (s) => entry.shortKeys.includes(s.key);
  const endOf = (s) => (isShort(s) ? Math.min(s.end, s.start + 30) : s.end);
  const isDone = (s) => entry.done.includes(s.key);
  const isPast = (s) => s.day < tIdx || (s.day === tIdx && endOf(s) <= now);
  const doneCount = entry.done.filter((k) => sessions.some((s) => s.key === k)).length;
  const target = targetFor(key);
  const credit = Math.min(1, sportCredit(key));
  return {
    key, entry, sessions, tIdx, now, isShort, endOf, isDone, isPast, doneCount, target, credit,
    counted: Math.min(target, doneCount + credit),
    nextUp: sessions.find((s) => !isDone(s) && !isPast(s)),
    todays: sessions.find((s) => s.day === tIdx),
  };
}
const dayDate = (key, d) => { const x = keyToDate(key); x.setDate(x.getDate() + d); return x; };
const statusOf = (ctx, s) => (ctx.isDone(s) ? { cls: 'done', label: 'Done' }
  : ctx.isPast(s) ? { cls: 'missed', label: 'Not done' }
  : s.day === ctx.tIdx ? { cls: 'today', label: 'Today' } : { cls: '', label: 'Upcoming' });
const whenText = (ctx, s) => `${s.day === ctx.tIdx ? 'Today' : s.day === ctx.tIdx + 1 ? 'Tomorrow' : DAYS[s.day]}, ${fmtTime(s.start)} to ${fmtTime(ctx.endOf(s))}`;
const sessionLog = (key, s) => (state.log && state.log[key] && state.log[key][s.key]) || {};
const loggedSets = (key, s, short) => {
  const log = sessionLog(key, s);
  return shownExercises(s, short).reduce((t, x) => t + Math.min(x.sets, doneSets(log[x.move]).length), 0);
};
const plannedSets = (s, short) => shownExercises(s, short).reduce((t, x) => t + x.sets, 0);
const workoutHref = (s, done) => `#workout/${encodeURIComponent(s.key)}${done ? '/done' : ''}`;

function muscleChips(s, fr, max = 6) {
  const ms = sessionFreshness(s, fr);
  if (!ms.length) return '';
  const list = fr.hasData ? ms.slice().sort((a, b) => a.fresh - b.fresh) : ms;
  return `<div class="mchips" aria-label="Muscles worked${fr.hasData ? ' and how recovered they are' : ''}">${list.slice(0, max).map((m) => `<span class="mchip"><i class="sw ${fr.hasData ? `l${freshnessLevel(m.fresh)}` : 'none'}" aria-hidden="true"></i>${m.label}${fr.hasData ? ` <b>${m.fresh}%</b>` : ''}</span>`).join('')}</div>`;
}

function sessionNotesHtml(ctx, s) {
  const notes = [...(s.notes || [])];
  if (ctx.isShort(s)) notes.push('Short on time: first 3 exercises, 30 minutes');
  const adj = adjOf(s);
  if (adj) notes.push(adj.note);
  if (s.locked) notes.push('Locked: Slotted won’t suggest moving it');
  return notes.length ? `<div class="notes">${notes.map((n) => `<span class="note ${/^(Short|Busy|Includes|Feeling|Light|Locked)/.test(n) ? 'short' : ''}">${esc(n)}</span>`).join('')}</div>` : '';
}

// Notes for a session that was moved by hand: sport on the day, and the next day's game.
function rebuildNotes(s, blocks) {
  const keep = (s.notes || []).filter((n) => /^(Includes|Short version|Busy week)/.test(n));
  const sportOn = (d) => blocks.filter((b) => b.day === d && b.type === 'sport').sort((a, b) => (b.intensity === 'hard') - (a.intensity === 'hard'))[0];
  const today = sportOn(s.day);
  const tomorrow = sportOn((s.day + 1) % 7);
  const out = [];
  if (today) out.push(`${today.label || 'Sport'} today`);
  if (tomorrow && tomorrow.intensity === 'hard' && sessionInfo(s.key).legs === 'none') out.push(`Upper body only, ${tomorrow.label || 'sport'} tomorrow`);
  return [...out, ...keep];
}

// Start, Done as planned, and the More menu, shared by every session card.
function sessionActions(ctx, s, hero = false) {
  const done = ctx.isDone(s);
  const past = ctx.isPast(s);
  const short = ctx.isShort(s);
  const started = loggedSets(ctx.key, s, short) > 0;
  const start = done
    ? `<a class="btn" href="${workoutHref(s, true)}">View summary</a>`
    : `<a class="btn primary${hero ? ' big' : ''}" href="${workoutHref(s)}">${icon('play')}${started ? 'Continue workout' : 'Start workout'}</a>`;
  return `<div class="${hero ? 'hero-actions' : 'scard-actions'}">
    ${start}
    ${done ? '' : `<button type="button" data-planned="${s.key}">Done, as planned</button>`}
    <details class="menu">
      <summary aria-label="More options for ${esc(s.name)}">More</summary>
      <div class="menu-pop">
        ${done ? `<button type="button" data-done="${s.key}">Undo done</button>` : `
          ${past ? '' : `<button type="button" data-short="${s.key}">${short ? 'Back to full session' : 'Short on time'}</button>`}
          ${past ? '' : `<button type="button" data-moveopen="${s.key}">Move to another day or time</button>`}
          <button type="button" data-missed="${s.key}">${s.day <= ctx.tIdx ? 'Missed it, move it' : 'Can’t make it, move it'}</button>
          <button type="button" data-done="${s.key}">Mark done without logging</button>
          <button type="button" data-lock="${s.key}">${s.locked ? 'Unlock this workout' : 'Lock this workout'}</button>`}
      </div>
    </details>
  </div>
  ${openMove === s.key ? moveBox(ctx, s) : ''}`;
}

function moveBox(ctx, s) {
  const taken = new Set(ctx.sessions.filter((x) => x.key !== s.key).map((x) => x.day));
  const days = DAYS.map((n, d) => ({ n, d })).filter(({ d }) => d >= ctx.tIdx && !taken.has(d));
  return `<div class="movebox" data-movebox="${s.key}">
    <p class="small muted">Pick a free day and start time. It has to fit around your commitments and training hours.</p>
    <div class="row">
      <div class="field"><label for="mv-day-${s.key}">Day</label>
        <select id="mv-day-${s.key}">${days.map(({ n, d }) => `<option value="${d}" ${d === s.day ? 'selected' : ''}>${d === ctx.tIdx ? 'Today' : n}</option>`).join('')}</select></div>
      <div class="field"><label for="mv-time-${s.key}">Start time</label><input id="mv-time-${s.key}" type="time" step="300" value="${toHHMM(s.start)}"></div>
    </div>
    <p class="errors" id="mv-err-${s.key}" role="alert"></p>
    <div class="actions"><button type="button" class="primary" data-movesave="${s.key}">Move session</button><button type="button" class="ghost" data-movecancel>Cancel</button></div>
  </div>`;
}

// ---------- workout: exercises ----------
// The value a set box shows: weights in the user's unit, seconds from older logs that kept them in "reps".
function boxValue(v, f, track) {
  if (f === 'kg') return v.kg === '' || v.kg === undefined ? '' : wt(v.kg);
  if (f === 'sec') return v.sec !== undefined ? v.sec : (v.reps !== undefined && v.reps !== '' && (track === 'duration' || track === 'weight_duration') ? v.reps : '');
  return v[f] ?? '';
}
const BOX = {
  kg: { mode: 'decimal', step: '0.5' }, reps: { mode: 'numeric', step: '1' }, sec: { mode: 'numeric', step: '1' }, m: { mode: 'decimal', step: '1' },
};
const isHold = (track) => track === 'duration' || track === 'weight_duration';

function exerciseCards(s, key, short) {
  const log = sessionLog(key, s);
  const skipped = skippedFor(s);
  const info = exerciseInfo();
  return sessionExercises(s, short).map((x, idx) => {
    const id = x.orig || x.move;
    if (skipped.includes(id)) {
      return `<li class="xcard is-skipped"><div class="skipline"><span><b>${esc(x.name)}</b> skipped this session</span><button type="button" class="ghost" data-skip="${s.key}|${id}">Undo skip</button></div></li>`;
    }
    const sets = log[x.move] || [];
    const lex = libFor(x);
    const track = trackOf(lex);
    const fields = fieldsFor(track);
    const sug = suggestFor(x, key, s.key, (adjOf(s) || {}).kgFactor || 1);
    const nDone = doneSets(sets).length;
    const i2 = info(x.move) || {};
    const muscles = Object.entries(musclesFor(x.move, x.name || i2.name, i2.group)).filter(([, w]) => w >= 1).map(([m]) => MUSCLE_LABEL[m] || MUSCLE_GROUPS[m]).filter(Boolean).join(', ');
    const sub = [muscles, x.origName ? `instead of ${x.origName}` : '', x.from ? `from ${sessionInfo(x.from).name}` : ''].filter(Boolean).join('. ');
    const head = (f) => (f === 'kg' ? weightLabel(lex, units()) : FIELD_LABEL[f]);
    const warm = hasWeight(track) && track === 'weight_reps' && !(lex && ['added', 'assisted'].includes(lex.load));
    const barbell = lex ? lex.equipment === 'barbell' : usesBarbell(x.name);
    const tid = `${s.key}|${x.move}`;
    return `
    <li class="xcard ${nDone >= x.sets ? 'is-done' : ''}" data-xcard="${esc(x.move)}" data-sets="${x.sets}" data-track="${track}">
      <div class="xhead">
        <span class="xnum" aria-hidden="true">${idx + 1}</span>
        <div class="xname">${esc(x.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        <span class="xtarget">${x.sets} × ${esc(x.reps)}</span>
      </div>
      <p class="xprev">${sug.last ? `Last time ${esc(fmtLast(sug.last, track))}` : 'First time logging this one'}${sug.up ? `<span class="up">${esc(sug.upText)}</span>` : ''}${sug.lighter ? `<span class="up">Light day: ${sug.kg} ${unitLabel(units())}</span>` : ''}</p>
      <div class="xtools">
        <button type="button" class="toolbtn" data-tool="swap|${s.key}|${id}" aria-expanded="${openTools.has(`swap|${s.key}|${id}`)}">Swap</button>
        ${warm ? `<button type="button" class="toolbtn" data-tool="warm|${s.key}|${id}" aria-expanded="${openTools.has(`warm|${s.key}|${id}`)}">${barbell ? 'Warm-up and plates' : 'Warm-up'}</button>` : ''}
        ${nDone ? '' : `<button type="button" class="toolbtn" data-skip="${s.key}|${id}">Skip</button>`}
      </div>
      ${openTools.has(`swap|${s.key}|${id}`) ? swapPanel(s, x) : ''}
      ${warm && openTools.has(`warm|${s.key}|${id}`) ? warmPanel(x, sets, sug, barbell) : ''}
      ${isHold(track) && nDone < x.sets ? holdTimerHtml(tid, sug.sec) : ''}
      <div class="sets" style="--cols:${fields.length}">
        <div class="sets-head" aria-hidden="true"><span>Set</span>${fields.map((f) => `<span>${esc(head(f))}</span>`).join('')}<span></span></div>
        ${Array.from({ length: x.sets }, (_, i) => {
          const v = sets[i] || {};
          const fid = `l-${s.key}-${x.move}-${i}`;
          return `<div class="set ${v.done ? 'is-done' : ''}" data-set="${s.key}|${x.move}|${i}">
            <span aria-hidden="true">${i + 1}</span>
            ${fields.map((f) => {
              const ph = sug[f] === '' || sug[f] === undefined ? (f === 'kg' ? '0' : '') : sug[f];
              return `<label class="sr" for="${fid}-${f}">${esc(x.name)}, set ${i + 1}, ${esc(f === 'kg' ? head(f).replace(/^kg/, 'kilograms').replace(/^lb/, 'pounds') : FIELD_LABEL[f].toLowerCase())}</label>
            <input id="${fid}-${f}" data-field="${f}" type="number" inputmode="${BOX[f].mode}" min="0" step="${BOX[f].step}" placeholder="${esc(ph)}" value="${esc(boxValue(v, f, track))}">`;
            }).join('')}
            <button type="button" class="tick" aria-pressed="${!!v.done}" aria-label="${esc(x.name)}, set ${i + 1} done">✓</button>
          </div>`;
        }).join('')}
      </div>
      ${nDone >= x.sets ? effortHtml(s.key, x.move, sets, x.name) : ''}
    </li>`;
  }).join('');
}

// ---------- effort ----------
// One optional tap per exercise once its sets are done. No tap means a normal hard set.
function effortHtml(sk, move, sets, name) {
  const cur = (doneSets(sets)[0] || {}).effort || '';
  return `<div class="effort" role="group" aria-label="How hard was ${esc(name)}?">
    <span class="small muted">How hard was it? <span class="faint">Optional</span></span>
    <div class="effort-opts">${Object.entries(EFFORT).map(([k, v]) => `<button type="button" data-effort="${esc(sk)}|${esc(move)}|${k}" aria-pressed="${cur === k}">${v.label}</button>`).join('')}</div>
  </div>`;
}
function wireEffort(rerender, wk) {
  app.querySelectorAll('[data-effort]').forEach((b) => b.addEventListener('click', () => {
    const [sk, move, level] = b.dataset.effort.split('|');
    const list = logFor(wk, sk)[move] || [];
    const same = doneSets(list).every((x) => x.effort === level);
    for (const x of list) if (x && x.done) { if (same) delete x.effort; else x.effort = level; }
    commit(); rerender();
  }));
}

// ---------- hold timer ----------
// A big stopwatch for timed exercises (planks, hangs, wall sits). Finishing fills in and ticks the next set.
let hold = null; // { id: "sessionKey|move", startedAt, elapsed (ms before the last pause), running, goal, beeped }
let holdTick = null;
const holdMs = () => (hold ? hold.elapsed + (hold.running ? Date.now() - hold.startedAt : 0) : 0);

function holdTimerHtml(id, goal) {
  const mine = hold && hold.id === id;
  const sec = mine ? Math.floor(holdMs() / 1000) : 0;
  const running = mine && hold.running;
  const paused = mine && !hold.running && hold.elapsed > 0;
  return `<div class="holdtimer${running ? ' running' : ''}${mine && goal && sec >= goal ? ' reached' : ''}" data-hold="${esc(id)}" data-goal="${goal || ''}">
    <div class="hold-read">
      <span class="hold-time num" data-holdtime aria-live="off">${mmss(sec)}</span>
      <span class="small muted">${goal ? `Goal ${esc(fmtDuration(goal))}` : 'Timer'}</span>
    </div>
    <div class="hold-actions">
      ${running ? '<button type="button" data-holdact="pause">Pause</button>'
        : `<button type="button" class="primary" data-holdact="start">${paused ? 'Resume' : 'Start'}</button>`}
      ${mine ? `<button type="button" data-holdact="finish">Finish set</button><button type="button" class="ghost" data-holdact="reset">Reset</button>` : ''}
    </div>
  </div>`;
}

function drawHold() {
  if (!hold) return;
  const el = app.querySelector(`[data-hold="${CSS.escape(hold.id)}"]`);
  if (!el) return;
  const sec = Math.floor(holdMs() / 1000);
  const t = el.querySelector('[data-holdtime]');
  if (t) t.textContent = mmss(sec);
  const goal = Number(el.dataset.goal) || 0;
  if (goal && sec >= goal) {
    el.classList.add('reached');
    if (hold.running && !hold.beeped) {
      hold.beeped = true;
      if (state.restMode !== 'silent') beep();
      try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch { /* ignore */ }
    }
  }
}

function wireHoldTimers(rerender) {
  app.querySelectorAll('[data-holdact]').forEach((b) => b.addEventListener('click', () => {
    const box = b.closest('[data-hold]');
    const id = box.dataset.hold;
    const act = b.dataset.holdact;
    if (act === 'start') {
      if (!hold || hold.id !== id) hold = { id, elapsed: 0, running: false, beeped: false };
      if (state.restMode !== 'silent') { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* ignore */ } }
      stopRest();
      hold.startedAt = Date.now();
      hold.running = true;
      keepAwake(true);
    } else if (act === 'pause' && hold) {
      hold.elapsed = holdMs();
      hold.running = false;
    } else if (act === 'reset') {
      hold = null;
    } else if (act === 'finish' && hold) {
      const sec = Math.round(holdMs() / 1000);
      hold = null;
      // Fill the next unticked set with the time and tick it, exactly as if typed.
      const card = box.closest('[data-xcard]');
      const row = [...card.querySelectorAll('.set')].find((r) => !r.classList.contains('is-done'));
      if (row && sec > 0) {
        row.querySelector('[data-field=sec]').value = sec;
        row.querySelector('.tick').click();
        return;
      }
    }
    rerender();
  }));
  clearInterval(holdTick);
  if (hold && hold.running) holdTick = setInterval(() => { if (!hold || !hold.running) { clearInterval(holdTick); return; } drawHold(); }, 250);
}

function swapPanel(s, x) {
  const inSession = shownExercises(s, false).map((e) => e.name);
  const from = x.origName || x.name;
  const lex = exerciseForMove(x.orig || x.move, from);
  // The library knows each exercise's muscles and movement; the older name rules are the fallback.
  let options = lex ? alternativesFor(lex, { fits: state.profile.equipment, exclude: inSession, limit: 6 }).map((o) => ({ name: o.name, kit: EQUIPMENT[o.equipment] })) : [];
  if (!options.length) options = alternatives(from, x.orig || x.move, state.profile.equipment, inSession);
  return `<div class="toolpanel">
    <p class="small muted">Swap ${esc(from)} for something that works the same muscles:</p>
    <div class="swaplist">
      ${options.map((o) => `<button type="button" data-swap="${s.key}|${x.orig || x.move}|${esc(o.name)}">${esc(o.name)}${o.kit ? `<small>${esc(o.kit)}</small>` : ''}</button>`).join('')}
      ${x.orig ? `<button type="button" class="ghost" data-swap="${s.key}|${x.orig}|">Back to ${esc(x.origName)}</button>` : ''}
    </div>
    ${options.length ? '' : '<p class="small">No good swaps for your equipment.</p>'}
  </div>`;
}

function warmPanel(x, sets, sug, barbell) {
  const typed = (sets.find((v) => v && Number(v.kg)) || {}).kg;
  const work = Number(typed ? wt(typed) : 0) || Number(sug.kg) || 0;
  const u = unitLabel(units());
  const opts = warmupOptions(units(), state.barKg, barbell);
  const bar = opts.bar;
  if (!work) return `<div class="toolpanel"><p class="small">Enter your working weight in the first set to see warm-up sets${barbell ? ' and plates' : ''}.</p></div>`;
  const steps = warmupSets(work, opts);
  const plates = (w) => {
    const p = platesPerSide(w, bar, platesFor(units(), PLATES));
    return p === null ? '' : p.length ? `${p.join(' + ')} each side` : 'Empty bar';
  };
  return `<div class="toolpanel">
    <ol class="warmlist">
      ${steps.map((w) => `<li><b>${w.kg} ${u} × ${w.reps}</b>${barbell ? `<span>${plates(w.kg)}</span>` : ''}</li>`).join('')}
      <li class="work"><b>${work} ${u} working sets</b>${barbell ? `<span>${plates(work) || `Can’t load ${work} ${u} exactly`}</span>` : ''}</li>
    </ol>
    ${barbell ? `<p class="small muted">On a ${bar} ${u} bar. Change it in Settings.</p>` : ''}
  </div>`;
}

// True when every set shown for this session is ticked.
function sessionComplete(s, key, short) {
  const log = sessionLog(key, s);
  return shownExercises(s, short).every((x) => doneSets(log[x.move]).length >= x.sets);
}

// The daily check-in. Three quick answers; four more are optional and tucked away.
// Works for a session (s) or, on a rest day, for just the day.
function checkinBlock(s, day = s ? s.day : todayIndex()) {
  const e = state.history[currentWeek()];
  const c = (e && e.checkins && e.checkins[day]) || {};
  const r = readiness(c);
  const extrasDone = EXTRAS.filter((q) => Number.isInteger(c[q.id])).length;
  const row = (q) => `<div class="ci-row" role="group" aria-label="${q.label}">
        <span class="ci-label">${q.label}</span>
        <div class="ci-opts${q.options.length > 3 ? ' four' : ''}">${q.options.map((o, i) => `<button type="button" data-ci="${q.id}|${i}" aria-pressed="${c[q.id] === i}">${esc(o)}</button>`).join('')}</div>
      </div>`;
  const more = `<details class="ci-more"${extrasDone ? ' open' : ''}><summary>More detail (optional)${extrasDone ? `, ${extrasDone} of ${EXTRAS.length} answered` : ''}</summary>${EXTRAS.map(row).join('')}</details>`;
  const attrs = `data-checkin="${s ? s.key : ''}" data-ciday="${day}"`;
  if (!r) {
    return `<div class="checkin" ${attrs}>
      <p class="ci-title">How are you feeling today?</p>
      ${QUESTIONS.map(row).join('')}
      ${more}
    </div>`;
  }
  return `<div class="checkin result ${r.level}" ${attrs}>
    <p class="ci-title">${esc(r.title)}</p>
    <p class="small">${esc(s ? r.text : { good: 'Enjoy the rest day.', easy: 'A quiet day helps. Slotted keeps this in mind for your next session.', rough: 'Rest up. If you’re still feeling this way tomorrow, your next session can be lighter.' }[r.level])}</p>
    ${more}
    <div class="ci-actions">
      ${s && r.level === 'rough' && !c.choice ? `<button type="button" class="primary" data-ci="choice|light">Light session</button><button type="button" data-ci="choice|rest">Rest today</button>` : ''}
      <button type="button" class="ghost" data-ci="reset|0">Change answers</button>
      ${askBtn(s ? `My check-in today says ${r.title.toLowerCase()}. Should I adjust today's session?` : `My check-in today says ${r.title.toLowerCase()}. How should I plan my next session?`, 'Ask the coach')}
    </div>
  </div>`;
}

// Shown Monday to Wednesday until dismissed: how last week went, and what's next.
function recapCard(key, nextUp, count) {
  state.recapSeen = state.recapSeen || {};
  if (state.recapSeen[key] || todayIndex() > 2) return '';
  const r = weekRecap({
    history: state.history, log: state.log, prevKey: addWeeks(key, -1), targetFor,
    sportCreditFor: templateSport, nameOf: (m) => moveName(m, state.profile.equipment),
  });
  if (!r.hadWeek) return '';
  const streak = streakInfo(state.history, key, targetFor, sportCredit);
  return `<section class="card recap" aria-labelledby="recap-h">
    <div class="recap-head">
      <span class="label">Your week in review</span>
      <button type="button" class="ghost" id="recap-close">Got it</button>
    </div>
    <h2 id="recap-h">${r.met ? 'Last week counted' : r.done >= r.target - 1 && r.done > 0 ? 'So close last week' : 'New week, fresh start'}</h2>
    <dl class="recap-stats">
      <div><dt>Sessions</dt><dd class="num">${r.done} of ${r.target}</dd></div>
      <div><dt>Sets logged</dt><dd class="num">${r.sets}</dd></div>
      <div><dt>Streak</dt><dd class="num">${r.met ? `${streak.current} wk` : 'Reset'}</dd></div>
    </dl>
    ${r.prs.length ? `<p class="small"><b>New bests:</b> ${r.prs.slice(0, 3).map((p) => `${esc(p.name)} ${esc(prText(p))}`).join(', ')}.</p>` : ''}
    <p class="small muted">${r.met ? '' : 'A new streak starts this week. '}${plural(count, 'session')} planned this week${nextUp ? `. First up: ${esc(nextUp.name)}, ${DAYS[nextUp.day]} ${fmtTime(nextUp.start)}.` : '.'}</p>
  </section>`;
}


// ---------- fatigue-aware suggestions ----------
// App logic looks at the next two days: muscle recovery (estimated), today's check-in and what the
// athlete said. It proposes moving, swapping, lightening or resting; nothing changes until accepted.
function weekProposals(ctx, { withStrava = true } = {}) {
  const e = ctx.entry;
  const cache = new Map();
  const freshAt = (day, start) => {
    const k = `${day}|${start}`;
    if (!cache.has(k)) {
      const d = dayDate(ctx.key, day);
      d.setHours(0, start, 0, 0);
      const fr = freshnessNow({ at: d < today() ? today() : d, withStrava });
      cache.set(k, Object.fromEntries(fr.muscles.map((m) => [m.id, m.fresh])));
    }
    return cache.get(k);
  };
  const info = exerciseInfo();
  const mainGroups = (s) => [...new Set(shownExercises(s, false).flatMap((x) => {
    const i = info(x.move) || {};
    return Object.entries(musclesFor(x.move, x.name || i.name, i.group)).filter(([, w]) => w >= 1).map(([g]) => g);
  }))];
  const skip = allSkip(e);
  const freeSlot = (d, len) => {
    if (skip.includes(d)) return null;
    const sl = bestSlot(blocksFor(ctx.key), d, winFor(ctx.key, d), len, state.profile.timeOfDay);
    return sl && !sl.short ? { start: sl.start, end: sl.end } : null;
  };
  const fits = (d, a, z) => freeGaps(blocksFor(ctx.key), d, winFor(ctx.key, d)).some(([x, y]) => a >= x && z <= y);
  return proposeChanges({
    sessions: e.plan, todayIdx: ctx.tIdx, nowMin: ctx.now, isDone: ctx.isDone, mainGroups, freshAt,
    labels: Object.fromEntries(MUSCLES.map((m) => [m.id, m.label])),
    readiness: readiness(e.checkins && e.checkins[ctx.tIdx]), report: e.reports && e.reports[ctx.tIdx],
    freeSlot, fits, dismissed: e.dismissed || [],
  });
}

const slotText = (x) => `${DAYS_SHORT[x.day]} ${fmtTime(x.start)}`;
function proposalsCard(ctx) {
  const { proposals, notes } = weekProposals(ctx);
  if (!proposals.length && !notes.length) return '';
  return `<section class="card proposals" aria-labelledby="prop-h">
    <div class="card-head"><h2 id="prop-h">Suggested changes</h2><span class="label">Nothing changes unless you accept</span></div>
    ${proposals.map((p) => `<div class="proposal">
      <b>${esc(p.title)}</b>
      <p class="small">${esc(p.reason)}</p>
      ${p.moves.length ? `<ul class="propmoves">${p.moves.map((m) => `<li><b>${esc(m.name)}</b> moves from ${slotText(m.from)} to ${slotText(m.to)}</li>`).join('')}</ul>` : ''}
      <div class="actions"><button type="button" class="primary" data-propyes="${esc(p.id)}">Accept</button><button type="button" class="ghost" data-propno="${esc(p.id)}">No thanks</button></div>
    </div>`).join('')}
    ${notes.map((n) => `<p class="small muted">${esc(n)}</p>`).join('')}
    <p class="rec-note">Based on estimates from your logged training and check-in, not a medical measurement. Commitments are never moved.</p>
  </section>`;
}

function wireProposals(rerender) {
  const ctx = weekCtx();
  const e = ctx.entry;
  app.querySelectorAll('[data-propyes]').forEach((b) => b.addEventListener('click', () => {
    const p = weekProposals(ctx).proposals.find((x) => x.id === b.dataset.propyes);
    if (!p) { rerender(); return; }
    const out = applyProposal(e.plan, p, e.lighten || []);
    e.plan = out.plan;
    e.lighten = out.lightened;
    for (const s of e.plan) if (p.keys.includes(s.key) && p.moves.length) s.notes = rebuildNotes(s, blocksFor(ctx.key));
    commit(); rerender(); renderSideWeek();
    toast(p.kind === 'lighten' ? `${p.title.replace(/^Make /, '').replace(/ lighter$/, '')} is now lighter` : 'Plan updated');
  }));
  app.querySelectorAll('[data-propno]').forEach((b) => b.addEventListener('click', () => {
    e.dismissed = [...new Set([...(e.dismissed || []), b.dataset.propno])];
    commit(); rerender();
  }));
}


// ---------- timetable changes in plain words ----------
// The athlete types a change ("I finish school at 1:05 on Tuesdays"). Slotted reads it (or asks the AI),
// checks it, shows exactly what would change, and only applies it when they say so.
let avail = { text: '', busy: false, changes: null, bad: [], note: '', done: '', photo: false };
// Photos of a timetable waiting to be read: [{ media_type, data (base64), url (for the thumbnail) }]. Never saved.
let availImgs = [];
let availWeek = 'both'; // with Week A/B on: which week a photo shows ('A', 'B' or 'both')
const availTemplates = () => (state.useAB && avail.photo && availWeek !== 'both' ? { templates: [availWeek] } : {});

// Shrink a photo on the device before it is sent: longest side 1600px, JPEG.
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), url };
}
const AVAIL_EXAMPLES = ['I finish school at 1:05 pm every Tuesday', 'I can’t train this Saturday', 'Basketball training Thursday 4–6 pm', 'My legs are still sore and I’m exhausted'];

// This week's plan as it would be under another state (same rules as replan, nothing saved).
function simulatePlan(st, key) {
  const e = (st.history || {})[key] || {};
  const tIdx = todayIndex();
  const now = nowMin();
  const plan = e.plan || [];
  const fixed = plan.filter((s) => s.pinned || s.locked || (e.done || []).includes(s.key) || s.day < tIdx || (s.day === tIdx && s.start <= now));
  const all = keysFor(key, e.busy);
  const keys = all.filter((k) => !fixed.some((f) => f.key === k)).slice(0, Math.max(0, all.length - fixed.length));
  const skipDays = [...new Set([...(e.skipDays || []), ...(st.restDays || [])])];
  const res = planWithFlex(st.profile, weekBlocks(st, key), st.window, { busy: e.busy, fixed, keys, fromDay: tIdx, nowMin: now, skipDays, keepOrder: keepOrder(), dayWindows: dayWindows(st, key) });
  return { plan: [...fixed, ...res.sessions].sort((a, b) => a.day - b.day), fixed, warnings: res.warnings };
}

function planDiff(before, after) {
  const out = [];
  for (const a of after) {
    const b = before.find((x) => x.key === a.key);
    if (!b) out.push(`${a.name} added on ${slotText(a)}`);
    else if (b.day !== a.day || b.start !== a.start) out.push(`${a.name} moves from ${slotText(b)} to ${slotText(a)}`);
  }
  for (const b of before) if (!after.some((a) => a.key === b.key)) out.push(`${b.name} on ${slotText(b)} no longer fits this week`);
  return out;
}

function availPreview() {
  const ctx = weekCtx();
  if (avail.busy) return '<p class="small muted" role="status">Working it out…</p>';
  if (avail.done) return `<div class="avail-done" role="status"><p class="small"><b>${esc(avail.done)}</b></p>${proposalsCard(ctx)}</div>`;
  if (!avail.changes) return avail.note ? `<p class="small" role="status">${esc(avail.note)}</p>` : '';
  const good = avail.changes;
  if (!good.length) {
    return `<div class="avail-preview" role="status"><p class="small">${esc(avail.note || 'Slotted couldn’t work out a change from that.')}</p>
      ${avail.bad.length ? `<ul class="small">${avail.bad.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      <p class="small muted">Try naming the day and time, like “I finish school at 2:30 on Wednesdays”, or change it below in My week.</p></div>`;
  }
  const next = applyChanges(state, good, ctx.key, ctx.tIdx, availTemplates());
  const sim = simulatePlan(next, ctx.key);
  const diff = planDiff(ctx.entry.plan, sim.plan);
  // Locked or hand-placed sessions stay put; say so if a change now clashes with one.
  const clashes = sim.fixed.filter((s) => !ctx.isDone(s) && !ctx.isPast(s)
    && !freeGaps(weekBlocks(next, ctx.key), s.day, windowFor(next, ctx.key, s.day)).some(([a, z]) => s.start >= a && s.end <= z));
  return `<div class="avail-preview" role="status">
    <span class="label">${avail.photo ? `Read from your photo${state.useAB && availWeek !== 'both' ? `, for Week ${availWeek}` : ''}` : 'What will change'}</span>
    ${avail.photo && avail.note ? `<p class="small muted">${esc(avail.note)}</p>` : ''}
    <ul class="propmoves">${good.map((c) => `<li>${esc(describeChange(c, ctx.key, ctx.tIdx))}${touchesFixed(c, state, ctx.key) ? ' <span class="badge">Fixed commitment</span>' : ''}</li>`).join('')}</ul>
    ${avail.bad.length ? `<p class="small muted">Left out: ${esc(avail.bad.join(' '))}</p>` : ''}
    <span class="label">This week’s plan</span>
    ${diff.length ? `<ul class="propmoves">${diff.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="small">No sessions need to move.</p>'}
    ${clashes.map((s) => `<p class="small note-warn">${esc(s.name)} is ${s.locked ? 'locked' : 'placed by hand'} on ${slotText(s)} and would clash. It stays put; move it yourself if you need to.</p>`).join('')}
    ${good.some((c) => c.op === 'feel') ? '<p class="small muted">Slotted will then check whether any sessions should move or get lighter, and ask you first.</p>' : ''}
    ${avail.photo ? '<p class="small muted">Check the times against your timetable. You can fix any of them afterwards in My week.</p>' : ''}
    <div class="actions"><button type="button" class="primary" id="av-yes">Apply</button><button type="button" class="ghost" id="av-no">Cancel</button></div>
  </div>`;
}

function availHtml() {
  return `<section class="card stack avail" aria-labelledby="av-h">
    <h2 id="av-h">Tell Slotted about a change</h2>
    <p class="muted small">Type it the way you’d say it. You’ll see exactly what changes before anything happens.</p>
    <form id="av-form" class="stack">
      <label class="sr" for="av-text">Describe the change</label>
      <textarea id="av-text" rows="2" maxlength="400" placeholder="I finish school at 1:05 pm on Tuesdays">${esc(avail.text)}</textarea>
      <div class="avail-ex">${AVAIL_EXAMPLES.map((x) => `<button type="button" class="ghost" data-avex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="avail-photo">
        <label class="btn" for="av-file">${icon('photo')}Add a photo of your timetable</label>
        <input id="av-file" class="sr" type="file" accept="image/*" multiple>
        ${availImgs.length ? `<div class="avail-thumbs">${availImgs.map((im, i) => `<span class="avail-thumb"><img src="${im.url}" alt="Timetable photo ${i + 1}"><button type="button" data-avimg="${i}" aria-label="Remove photo ${i + 1}">×</button></span>`).join('')}</div>` : ''}
        ${availImgs.length && state.useAB ? `<div class="field"><label for="av-week">This photo shows</label><select id="av-week">${[['both', 'Every week (A and B)'], ['A', 'Week A'], ['B', 'Week B']].map(([v, t]) => `<option value="${v}" ${availWeek === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
        <p class="hint" style="margin:0">${availImgs.length ? 'The photo is sent to the AI to be read and isn’t saved.' : 'A screenshot or clear photo works best. Crop out your name first if you like.'}</p>
      </div>
      <div class="actions"><button type="submit" class="primary">${availImgs.length ? 'Read my timetable' : 'Check it'}</button></div>
    </form>
    <div id="av-out">${availPreview()}</div>
  </section>`;
}

function wireAvail(rerender) {
  const form = document.getElementById('av-form');
  if (!form) return;
  const text = document.getElementById('av-text');
  app.querySelectorAll('[data-avex]').forEach((b) => b.addEventListener('click', () => { text.value = b.dataset.avex; avail.text = text.value; text.focus(); }));
  text.addEventListener('input', () => { avail.text = text.value; });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ctx = weekCtx();
    const said = text.value.trim();
    if (!said && !availImgs.length) return;
    avail = { text: said, busy: false, changes: null, bad: [], note: '', done: '', photo: availImgs.length > 0 };
    let changes;
    if (avail.photo) {
      avail.busy = true; rerender();
      const res = await askTimetable(said, timetableContext(state, ctx.key, ctx.tIdx), { images: availImgs.map(({ media_type, data }) => ({ media_type, data })) });
      avail.busy = false;
      if (res.error) {
        avail.changes = [];
        avail.note = {
          offline: 'You’re offline. Reading a photo needs an internet connection.',
          rate_limited: 'You’ve used today’s AI questions. Try the photo again tomorrow, or add your commitments by hand below.',
          image_rejected: 'That image couldn’t be used. Try a screenshot, or a smaller JPG or PNG.',
        }[res.error] || 'The AI isn’t available right now, so the photo couldn’t be read. You can add your commitments by hand below.';
        rerender(); return;
      }
      changes = photoChanges(res.changes, state, availTemplates());
      avail.note = res.note || (changes.length ? '' : 'Nothing new was found in that photo. Your timetable may already match it.');
    } else ({ changes } = parseAvailability(said, { todayIdx: ctx.tIdx }));
    if (!avail.photo && !changes.length) {
      avail.busy = true; rerender();
      const res = await askTimetable(said, timetableContext(state, ctx.key, ctx.tIdx));
      avail.busy = false;
      if (res.error) {
        avail.changes = [];
        avail.note = res.error === 'offline' ? 'You’re offline, and Slotted couldn’t read that on its own.' : 'Slotted couldn’t read that on its own, and the AI isn’t available right now.';
        rerender(); return;
      }
      changes = res.changes;
      avail.note = res.note;
    }
    const bad = [];
    avail.changes = changes.filter((c) => {
      const errs = validateChange(c, state, ctx.key);
      if (errs.length) bad.push(errs[0]);
      return !errs.length;
    });
    avail.bad = bad;
    rerender();
  });
  const yes = document.getElementById('av-yes');
  if (yes) yes.addEventListener('click', () => {
    const ctx = weekCtx();
    const list = avail.changes;
    state = applyChanges(state, list, ctx.key, ctx.tIdx, availTemplates());
    const fromPhoto = avail.photo;
    // Rebuild the weeks the changes touch (this week now; next week rebuilds itself when it starts).
    replan(ctx.key);
    commit();
    avail = { text: '', busy: false, changes: null, bad: [], note: '', photo: false, done: fromPhoto ? `Done: ${plural(list.length, 'change')} from your photo applied.` : `Done: ${list.map((c) => describeChange(c, ctx.key, ctx.tIdx)).join('; ')}.` };
    if (fromPhoto) availImgs = [];
    rerender(); renderSideWeek();
  });
  const no = document.getElementById('av-no');
  if (no) no.addEventListener('click', () => { avail = { ...avail, changes: null, bad: [], note: '' }; rerender(); });
  const file = document.getElementById('av-file');
  if (file) file.addEventListener('change', async () => {
    const picked = [...file.files].filter((f) => /^image\//.test(f.type)).slice(0, Math.max(0, PHOTO_MAX_IMAGES - availImgs.length));
    if (file.files.length && !picked.length) toast(availImgs.length >= PHOTO_MAX_IMAGES ? `Up to ${PHOTO_MAX_IMAGES} photos at a time.` : 'Pick an image file.');
    for (const f of picked) {
      try { availImgs.push(await shrinkImage(f)); } catch { toast('Couldn’t read that image. Try a screenshot, JPG or PNG.'); }
    }
    avail = { ...avail, changes: null, bad: [], note: '', done: '' };
    rerender();
  });
  app.querySelectorAll('[data-avimg]').forEach((b) => b.addEventListener('click', () => {
    availImgs.splice(Number(b.dataset.avimg), 1);
    avail = { ...avail, changes: null, bad: [], note: '' };
    rerender();
  }));
  const wk = document.getElementById('av-week');
  if (wk) wk.addEventListener('change', () => { availWeek = wk.value; avail = { ...avail, changes: null, bad: [], note: '' }; rerender(); });
  wireProposals(rerender);
}

// ---------- calendar ----------
function calendarHtml(ctx) {
  const blocks = blocksFor(ctx.key);
  const stravaWeek = stravaFor(ctx.key);
  const rest = state.restDays || [];
  const ws = DAYS.map((_, d) => winFor(ctx.key, d));
  const winStart = Math.min(...ws.map((w) => toMin(w.start)));
  const winEnd = Math.max(...ws.map((w) => toMin(w.end)));
  const hourPx = 26;
  const height = ((winEnd - winStart) / 60) * hourPx;
  const y = (m) => ((m - winStart) / 60) * hourPx;
  const place = (s, e) => {
    const a = Math.max(winStart, s); const b = Math.min(winEnd, e);
    return b > a ? `top:${y(a)}px;height:${Math.max(8, y(b) - y(a))}px` : null;
  };
  const axis = [];
  for (let h = Math.ceil(winStart / 120) * 2; h * 60 <= winEnd; h += 2) {
    axis.push(`<span style="top:${y(h * 60)}px">${h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}</span>`);
  }
  const sessFor = (d) => ctx.sessions.find((x) => x.day === d);
  const cls = (s) => (ctx.isDone(s) ? 'done' : ctx.isPast(s) ? 'missed' : '');

  const grid = `<section class="cal" style="--hour:${hourPx}px" aria-label="Week calendar">
    <div></div>
    ${DAYS_SHORT.map((n, d) => {
      const date = dayDate(ctx.key, d);
      const s = sessFor(d);
      return `<div class="cal-head ${d === ctx.tIdx ? 'is-today' : ''}"><b>${n}</b><small>${date.getDate()}</small>${s ? '' : `<span class="restlabel">${rest.includes(d) || ctx.entry.skipDays.includes(d) ? 'Rest day' : 'No session'}</span>`}</div>`;
    }).join('')}
    <div class="cal-axis" style="height:${height}px">${axis.join('')}</div>
    ${DAYS.map((name, d) => {
      const items = blocks.filter((b) => b.day === d).map((b) => {
        const pos = place(toMin(b.start), toMin(b.end));
        return pos ? `<div class="blk ${b.type}" style="${pos}" title="${esc(b.label)}, ${fmtTime(toMin(b.start))} to ${fmtTime(toMin(b.end))}"><b>${esc(b.label)}</b></div>` : '';
      });
      for (const a of stravaWeek.filter((x) => x.day === d)) {
        const st = toMin(a.start);
        const pos = place(st, st + a.minutes);
        if (pos) items.push(`<div class="blk sport strava" style="${pos}" title="${esc(a.name)}, from Strava"><b>${esc(a.name)}</b></div>`);
      }
      const s = sessFor(d);
      if (s) {
        const pos = place(s.start, ctx.endOf(s));
        if (pos) items.push(`<a class="blk train ${cls(s)} ${(ctx.endOf(s) - s.start) / 60 * hourPx < 36 ? 'tight' : ''}" style="${pos}" href="${workoutHref(s, ctx.isDone(s))}" aria-label="${esc(s.name)}, ${name} ${fmtTime(s.start)}"><b>${esc(s.name)}</b><span class="t">${fmtTime(s.start)}</span></a>`);
      }
      const skipped = ctx.entry.skipDays.includes(d) ? ' skipped' : '';
      return `<div class="cal-col${d === ctx.tIdx ? ' is-today' : ''}${skipped}" style="height:${height}px">${items.join('')}</div>`;
    }).join('')}
  </section>`;

  const agenda = `<ol class="agenda" aria-label="Week, day by day">${DAYS.map((name, d) => {
    const date = dayDate(ctx.key, d);
    const items = [
      ...blocks.filter((b) => b.day === d).map((b) => ({ t: toMin(b.start), html: `<div class="a-item ${b.type}"><span>${esc(b.label)}</span><span>${fmtTime(toMin(b.start))}</span></div>` })),
      ...stravaWeek.filter((a) => a.day === d).map((a) => ({ t: toMin(a.start), html: `<div class="a-item sport strava"><span>${esc(a.name)}</span><span>${fmtTime(toMin(a.start))}</span></div>` })),
    ];
    const s = sessFor(d);
    if (s) items.push({ t: s.start, html: `<a class="a-item train ${cls(s)}" href="${workoutHref(s, ctx.isDone(s))}"><span>${esc(s.name)}${ctx.isDone(s) ? ', done' : ''}</span><span>${fmtTime(s.start)}</span></a>` });
    items.sort((a, b) => a.t - b.t);
    return `<li class="${d === ctx.tIdx ? 'is-today' : ''}" id="day-${d}">
      <span class="a-day"><b>${DAYS_SHORT[d]}</b><small>${date.getDate()}</small></span>
      <div class="a-items">${items.map((i) => i.html).join('')}${s ? '' : `<span class="a-rest">${rest.includes(d) ? 'Rest day' : 'No gym session'}</span>`}</div>
    </li>`;
  }).join('')}</ol>`;

  const types = new Set(blocks.map((b) => b.type));
  const legend = `<div class="legend" aria-hidden="true">
    <span><i style="background:var(--lime)"></i>Gym session</span>
    ${types.has('sport') || stravaWeek.length ? '<span><i style="background:var(--amber)"></i>Sport</span>' : ''}
    ${types.has('school') ? '<span><i style="background:var(--school)"></i>School</span>' : ''}
    ${types.has('work') ? '<span><i style="background:var(--work)"></i>Work</span>' : ''}
    ${types.has('other') ? '<span><i style="background:var(--other)"></i>Other</span>' : ''}
    ${stravaWeek.length ? '<span><i style="background:var(--strava)"></i>From Strava</span>' : ''}
  </div>
  ${stravaWeek.length ? `<p class="strava-line">From Strava this week: ${stravaWeek.map((a) => `${DAYS_SHORT[a.day]} ${esc(a.name)}${a.km ? `, ${a.km} km` : `, ${a.minutes} min`}`).join('; ')}.</p>` : ''}`;
  return grid + agenda + legend;
}

// ---------- This week ----------
const lastDoneCount = {};
let focusDay = null;

function sessionCard(ctx, s, fr) {
  const st = statusOf(ctx, s);
  const date = dayDate(ctx.key, s.day);
  const short = ctx.isShort(s);
  const n = shownExercises(s, short).length;
  return `<article class="scard ${ctx.isDone(s) ? 'is-done' : ''}" id="s-${esc(s.key)}">
    <div class="scard-top">
      <span class="label"><b>${DAYS[s.day]}</b> ${date.getDate()} ${date.toLocaleDateString('en-AU', { month: 'short' })}</span>
      <span class="badge ${st.cls}">${st.label}</span>
    </div>
    <h3><a href="${workoutHref(s, ctx.isDone(s))}">${esc(s.name)}</a></h3>
    <p class="scard-meta"><span>${fmtTime(s.start)} to ${fmtTime(ctx.endOf(s))}</span><span>${plural(n, 'exercise')}</span><span>${ctx.endOf(s) - s.start} min</span></p>
    ${muscleChips(s, fr, 4)}
    ${sessionNotesHtml(ctx, s)}
    ${sessionActions(ctx, s)}
  </article>`;
}

function renderPlan() {
  const ctx = weekCtx();
  const { key, entry, sessions, nextUp, target, counted, doneCount, credit } = ctx;
  const type = typeOf(key);
  const blocks = blocksFor(key);
  const streak = streakInfo(state.history, key, targetFor, sportCredit);
  const monday = keyToDate(key);
  const fr = freshnessNow();
  const justFinished = doneCount > (lastDoneCount[key] ?? doneCount);
  lastDoneCount[key] = doneCount;
  if (routeArgs[0] && /^day-\d$/.test(routeArgs[0])) focusDay = Number(routeArgs[0].slice(4));
  const rest = sessions.filter((s) => s !== nextUp);
  const remaining = Math.max(0, target - counted);

  let next = '';
  if (nextUp) {
    const short = ctx.isShort(nextUp);
    const list = shownExercises(nextUp, short);
    next = `<article class="hero next-card" aria-labelledby="next-name">
      <p class="hero-when">Up next. ${whenText(ctx, nextUp)}</p>
      <h2 id="next-name">${esc(nextUp.name)}</h2>
      <dl class="hero-facts">
        <div><dt>Exercises</dt><dd class="num">${list.length}</dd></div>
        <div><dt>Sets</dt><dd class="num">${loggedSets(key, nextUp, short) ? `${loggedSets(key, nextUp, short)} of ${plannedSets(nextUp, short)}` : plannedSets(nextUp, short)}</dd></div>
        <div><dt>Duration</dt><dd class="num">${ctx.endOf(nextUp) - nextUp.start} min</dd></div>
      </dl>
      ${muscleChips(nextUp, fr)}
      ${sessionNotesHtml(ctx, nextUp)}
      ${nextUp.day === ctx.tIdx ? checkinBlock(nextUp) : ''}
      <ul class="exprev">${list.map((x) => `<li><span>${esc(x.name)}</span><span>${x.sets} × ${esc(x.reps)}</span></li>`).join('')}</ul>
      ${sessionActions(ctx, nextUp, true)}
    </article>`;
  } else if (sessions.length) {
    next = `<section class="hero rest-day next-card">
      <p class="hero-when">This week</p>
      <h2>${doneCount >= sessions.length ? 'Every session done' : 'Nothing left to train this week'}</h2>
      <p class="muted">${doneCount >= sessions.length ? 'Nice work. Rest up. Next week’s plan appears on Monday.' : 'Next week’s plan appears on Monday.'}</p>
    </section>`;
  }

  app.innerHTML = `
  ${subnav('plan')}
  <div class="page-head">
    <div>
      <h1>This week</h1>
      <p class="page-sub">Week of ${fmtDate(monday)}${state.useAB ? `, Week ${type}` : ''}${entry.busy ? '. Busy week: fewer, shorter sessions.' : ''}</p>
    </div>
    <div class="page-actions">
      <button type="button" class="switch" id="busy" role="switch" aria-checked="${!!entry.busy}"><span class="track" aria-hidden="true"></span>Busy week</button>
    </div>
  </div>
  ${proposalsCard(ctx)}

  <section class="card week-strip">
    <div class="big-count"><span class="num ${streak.thisWeekMet && justFinished ? 'streak-pop' : ''}">${counted}</span><span>of ${plural(target, 'session')}</span></div>
    <div class="wk-meter">
      <div class="meter" aria-hidden="true"><i style="--w:${target ? Math.round((counted / target) * 100) : 0}%"></i></div>
      <p class="small muted">${streak.thisWeekMet ? 'Weekly target hit. This week counts toward your streak.' : `${plural(remaining, 'session')} to go${credit ? ', one counted from sport' : ''}.`}</p>
    </div>
    <dl class="facts">
      <div><dt>Remaining</dt><dd class="num">${remaining}</dd></div>
      <div><dt>Streak</dt><dd class="num">${streak.current} wk</dd></div>
    </dl>
  </section>

  ${blocks.length ? '' : `<p class="callout" style="margin-top:16px">Your week is empty, so every day looks free. <a href="#week">Add school and sport</a> to get a plan that fits.</p>`}
  ${next || `<p class="callout" style="margin-top:16px">No free time for training this week. <a href="#week">Check My week</a> or widen your training hours.</p>`}
  ${entry.warnings && entry.warnings.length ? `<ul class="warnings">${entry.warnings.map((w) => `<li>${esc(w.text)}</li>`).join('')}</ul>` : ''}

  <div class="sec-head"><h2>Calendar</h2><a href="#week">Edit commitments</a></div>
  ${calendarHtml(ctx)}

  ${rest.length ? `
  <div class="sec-head"><h2>${nextUp ? 'Rest of the week' : 'Sessions'}</h2></div>
  <div class="sessions-grid">${rest.map((s) => sessionCard(ctx, s, fr)).join('')}</div>` : ''}
  <div class="ask-row" style="margin-top:22px">${askBtn('Can you help me organise next week’s workouts around my commitments?', 'Ask the coach to help organise next week')}</div>`;

  document.getElementById('busy').addEventListener('click', () => {
    entry.busy = !entry.busy;
    replan(key);
    renderPlan(); renderSideWeek();
    toast(entry.busy ? `Busy week: ${targetFor(key)} shorter sessions` : 'Back to your normal plan');
  });
  wireSessionActions(renderPlan);
  wireAsk();
  if (focusDay !== null) {
    const d = focusDay; focusDay = null;
    const s = sessions.find((x) => x.day === d);
    requestAnimationFrame(() => {
      const target2 = (s && document.getElementById(`s-${s.key}`)) || (window.matchMedia('(max-width: 720px)').matches ? document.getElementById(`day-${d}`) : document.querySelector('.cal'));
      if (target2) target2.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
}

// ---------- session actions, shared by Home, This week and the workout ----------
function wireSessionActions(rerender, opts = {}) {
  const key = currentWeek();
  const entry = ensurePlan(key);
  const byKey = (k) => entry.plan.find((x) => x.key === k);
  const isShort = (s) => entry.shortKeys.includes(s.key);
  const times = (sk) => { entry.times = entry.times || {}; return entry.times[sk] || (entry.times[sk] = {}); };
  const markStarted = (sk) => { const t = times(sk); if (!t.start) t.start = Date.now(); };
  const markFinished = (sk) => { const t = times(sk); if (t.start && !t.end) t.end = Date.now(); };
  const refresh = () => { rerender(); renderSideWeek(); };

  const completeIfFinished = (sk) => {
    const s = byKey(sk);
    if (!s || entry.done.includes(sk) || !loggedSets(key, s, isShort(s)) || !sessionComplete(s, key, isShort(s))) return false;
    const before = streakInfo(state.history, key, targetFor, sportCredit).thisWeekMet;
    entry.done = [...entry.done, sk];
    markFinished(sk);
    commit();
    stopRest();
    const after = streakInfo(state.history, key, targetFor, sportCredit).thisWeekMet;
    if (opts.workout === sk) { location.hash = workoutHref(s, true); return true; }
    refresh();
    toast(!before && after ? 'Week complete. Streak extended.' : `${s.name} done`);
    return true;
  };

  app.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.done;
    const was = entry.done.includes(k);
    const before = streakInfo(state.history, key, targetFor, sportCredit).thisWeekMet;
    entry.done = was ? entry.done.filter((x) => x !== k) : [...entry.done, k];
    if (!was) markFinished(k);
    commit(); refresh();
    const after = streakInfo(state.history, key, targetFor, sportCredit).thisWeekMet;
    toast(!before && after ? 'Week complete. Streak extended.' : was ? 'Marked as not done' : 'Marked done');
  }));

  const missSession = (k) => {
    const s = byKey(k);
    if (s.day >= todayIndex() && !entry.skipDays.includes(s.day)) entry.skipDays.push(s.day);
    s.pinned = false;
    const res = replan(key, k);
    openMove = null;
    const moved = entry.plan.find((x) => x.key === k);
    const msg = moved ? `${s.name} moved to ${DAYS[moved.day]}`
      : res.sessions.some((x) => (x.merged || []).includes(k)) ? `${s.name}’s main lifts moved into another session`
      : `No time left this week for ${s.name}`;
    if (opts.workout) location.hash = '#plan'; else refresh();
    toast(msg);
  };
  app.querySelectorAll('[data-missed]').forEach((b) => b.addEventListener('click', () => missSession(b.dataset.missed)));

  app.querySelectorAll('[data-ci]').forEach((b) => b.addEventListener('click', () => {
    const [field, val] = b.dataset.ci.split('|');
    const box = b.closest('[data-checkin]');
    const s = box.dataset.checkin ? byKey(box.dataset.checkin) : null;
    const day = s ? s.day : Number(box.dataset.ciday);
    entry.checkins = entry.checkins || {};
    const c = { ...(entry.checkins[day] || {}) };
    if (field === 'reset') { delete entry.checkins[day]; commit(); rerender(); return; }
    if (field === 'choice' && val === 'rest' && s) { delete entry.checkins[day]; commit(); missSession(s.key); return; }
    // Tapping the chosen answer again clears it (handy for the optional ones).
    if (field !== 'choice' && c[field] === Number(val)) delete c[field];
    else c[field] = field === 'choice' ? val : Number(val);
    entry.checkins[day] = c;
    commit(); rerender();
  }));

  app.querySelectorAll('[data-short]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.short;
    entry.shortKeys = entry.shortKeys.includes(k) ? entry.shortKeys.filter((x) => x !== k) : [...entry.shortKeys, k];
    commit(); rerender();
  }));

  app.querySelectorAll('[data-lock]').forEach((b) => b.addEventListener('click', () => {
    const s = byKey(b.dataset.lock);
    s.locked = !s.locked;
    commit(); refresh();
    toast(s.locked ? `${s.name} locked. Suggestions won’t move it.` : `${s.name} unlocked`);
  }));

  app.querySelectorAll('[data-moveopen]').forEach((b) => b.addEventListener('click', () => { openMove = b.dataset.moveopen; rerender(); }));
  app.querySelectorAll('[data-movecancel]').forEach((b) => b.addEventListener('click', () => { openMove = null; rerender(); }));
  app.querySelectorAll('[data-movesave]').forEach((b) => b.addEventListener('click', () => {
    const s = byKey(b.dataset.movesave);
    const day = Number(document.getElementById(`mv-day-${s.key}`).value);
    const time = document.getElementById(`mv-time-${s.key}`).value;
    const err = document.getElementById(`mv-err-${s.key}`);
    if (!time) { err.textContent = 'Pick a start time.'; return; }
    const start = toMin(time);
    const len = s.end - s.start;
    if (day === todayIndex() && start <= nowMin()) { err.textContent = 'Pick a time later today, or another day.'; return; }
    if (entry.plan.some((x) => x !== s && x.day === day)) { err.textContent = 'There’s already a session that day.'; return; }
    const w = winFor(key, day);
    const fits = freeGaps(blocksFor(key), day, w).some(([a, z]) => start >= a && start + len <= z);
    if (!fits) { err.textContent = `That clashes with a commitment or falls outside your training hours (${fmtTime(toMin(w.start))} to ${fmtTime(toMin(w.end))}).`; return; }
    Object.assign(s, { day, start, end: start + len, pinned: true });
    s.notes = rebuildNotes(s, blocksFor(key));
    entry.plan.sort((a, z) => a.day - z.day);
    openMove = null;
    commit(); refresh();
    toast(`${s.name} moved to ${DAYS[day]}, ${fmtTime(start)}`);
  }));

  // Typing a number saves it; it still needs a tick to count.
  app.querySelectorAll('.set input').forEach((inp) => inp.addEventListener('change', () => {
    const [sk, move, i] = inp.closest('.set').dataset.set.split('|');
    const log = logFor(key, sk);
    log[move] = log[move] || [];
    const f = inp.dataset.field;
    const v = inp.value === '' ? '' : Number(inp.value);
    log[move][Number(i)] = { ...(log[move][Number(i)] || {}), [f]: f === 'kg' ? toKg(v, units()) : v };
    commit();
  }));

  const updateProgress = (sk) => {
    const s = byKey(sk);
    const done = loggedSets(key, s, isShort(s));
    const total = plannedSets(s, isShort(s));
    const c = document.getElementById('wk-count');
    const m = document.getElementById('wk-meter');
    if (c) c.textContent = done;
    if (m) m.style.setProperty('--w', `${total ? Math.round((done / total) * 100) : 0}%`);
    const log = sessionLog(key, s);
    app.querySelectorAll('[data-xcard]').forEach((card) => card.classList.toggle('is-done', doneSets(log[card.dataset.xcard]).length >= Number(card.dataset.sets)));
  };

  app.querySelectorAll('.set .tick').forEach((btn) => btn.addEventListener('click', () => {
    const row = btn.closest('.set');
    const [sk, move, iStr] = row.dataset.set.split('|');
    const i = Number(iStr);
    const log = logFor(key, sk);
    log[move] = log[move] || [];
    const cur = log[move][i] || {};
    if (cur.done) {
      log[move][i] = { ...cur, done: false };
      row.classList.remove('is-done'); btn.setAttribute('aria-pressed', 'false');
      commit(); updateProgress(sk); return;
    }
    // Empty boxes take the suggested number. Weights are typed in the user's unit and stored in kg.
    const vals = {};
    row.querySelectorAll('input[data-field]').forEach((inp) => {
      const f = inp.dataset.field;
      const ph = inp.placeholder;
      const v = inp.value !== '' ? Number(inp.value) : (ph !== '' && !(f === 'kg' && ph === '0') ? Number(ph) : '');
      inp.value = v;
      vals[f] = f === 'kg' ? toKg(v, units()) : v;
    });
    const sess = byKey(sk);
    const shown = shownExercises(sess, isShort(sess));
    const ex = shown.find((x) => x.move === move) || { name: 'that lift', move };
    const track = trackFor(ex);
    const prev = setsOutside(move, track, { w: key, s: sk, i });
    log[move][i] = { ...vals, done: true };
    row.classList.add('is-done'); btn.setAttribute('aria-pressed', 'true');
    markStarted(sk);
    commit();
    updateProgress(sk);
    const kind = newBest(bestTrack(ex), prev, normSet(log[move][i], track));
    if (kind) toast(bestText(kind, ex.name, normSet(log[move][i], track), units()));
    if (!completeIfFinished(sk)) {
      startRest(restSeconds(state.profile.goal, move, ex.name), nextSetLabel(sess, shown, key));
      if (isHold(track) || doneSets(log[move]).length >= ex.sets) rerender();
    }
  }));

  app.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.tool;
    if (openTools.has(id)) openTools.delete(id); else openTools.add(id);
    rerender();
  }));

  app.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => {
    const [sk, orig, name] = b.dataset.swap.split('|');
    entry.swaps = entry.swaps || {};
    entry.swaps[sk] = entry.swaps[sk] || {};
    if (name) {
      entry.swaps[sk][orig] = name;
      state.exerciseNames = { ...(state.exerciseNames || {}), [exerciseKey(name)]: name };
      rememberExerciseNames(state.exerciseNames);
    } else delete entry.swaps[sk][orig];
    openTools.delete(`swap|${sk}|${orig}`);
    commit(); rerender();
    toast(name ? `Swapped to ${name} for this session` : 'Back to the original exercise');
  }));

  app.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
    const [sk, id] = b.dataset.skip.split('|');
    entry.skips = entry.skips || {};
    const list = entry.skips[sk] || [];
    const skipping = !list.includes(id);
    entry.skips[sk] = skipping ? [...list, id] : list.filter((x) => x !== id);
    commit();
    if (!completeIfFinished(sk)) { rerender(); toast(skipping ? 'Skipped for this session' : 'Exercise back in'); }
  }));

  app.querySelectorAll('[data-planned]').forEach((b) => b.addEventListener('click', () => {
    const sk = b.dataset.planned;
    const s = byKey(sk);
    const log = logFor(key, sk);
    for (const x of shownExercises(s, isShort(s))) {
      const sug = suggestFor(x, key, sk, (adjOf(s) || {}).kgFactor || 1);
      log[x.move] = log[x.move] || [];
      for (let i = 0; i < x.sets; i++) {
        const cur = log[x.move][i] || {};
        if (cur.done) continue;
        const set = {};
        for (const f of fieldsFor(sug.track)) {
          const have = f === 'sec' ? boxValue(cur, 'sec', sug.track) : cur[f];
          set[f] = have !== undefined && have !== '' && have !== 0 ? have : f === 'kg' ? toKg(sug.kg, units()) : sug[f];
          if (f === 'kg' && have === 0) set.kg = 0;
        }
        log[x.move][i] = { ...set, done: true };
      }
    }
    commit();
    if (!completeIfFinished(sk)) { rerender(); toast('Sets logged'); }
  }));

  wireHoldTimers(rerender);
  wireEffort(rerender, key);
  wireProposals(rerender);

  app.querySelectorAll('details.menu').forEach((m) => m.addEventListener('toggle', () => {
    if (m.open) app.querySelectorAll('details.menu[open]').forEach((o) => { if (o !== m) o.open = false; });
  }));
}

// ---------- Home ----------
function greeting() {
  const h = today().getHours();
  const part = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  return state.name ? `${part}, ${state.name}` : part;
}
const statsOpts = (key) => ({ targetFor, sportCreditFor: (k) => (k === key ? sportCredit(k) : templateSport(k)) });
const trainingData = () => ({ history: state.history || {}, log: state.log || {} });
const nameOfMove = (m) => moveName(m, state.profile.equipment);

// Week labels for bar charts: the month only appears where it changes, so labels fit on a phone.
function barLabel(weeks, i, every, cur) {
  if (cur) return 'Now';
  if ((weeks.length - 1 - i) % every !== 0) return '';
  const d = keyToDate(weeks[i].key);
  let prev = null;
  for (let j = i - 1; j >= 0; j--) if ((weeks.length - 1 - j) % every === 0) { prev = keyToDate(weeks[j].key); break; }
  return prev && prev.getMonth() === d.getMonth() ? String(d.getDate()) : fmtDate(d);
}

// Small weekly bars: sessions done against the target for each week.
function sessionBars(weeks, currentKey, short = false) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.done, w.target)));
  const every = weeks.length > 14 ? Math.ceil(weeks.length / 10) : 1;
  return `<div class="bars${short ? ' short' : ''}" role="img" aria-label="Sessions per week: ${weeks.map((w) => `${fmtDate(keyToDate(w.key))} ${w.done} of ${w.target}`).join(', ')}">
    ${weeks.map((w, i) => {
      const cur = w.key === currentKey;
      const label = barLabel(weeks, i, every, cur);
      return `<div class="bar-col${cur ? ' current' : ''}">
        <div class="bar"><span class="bar-target" style="--t:${(w.target / max) * 100}%"></span><span class="bar-fill${w.met ? '' : ' low'}" style="--h:${(w.done / max) * 100}%"></span><span class="bar-val" style="--h:${(w.done / max) * 100}%">${w.done}</span></div>
        <span class="bar-label">${label}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderHome() {
  const ctx = weekCtx();
  const { key, entry, sessions, tIdx, target, counted, doneCount, credit } = ctx;
  const data = trainingData();
  const opts = statsOpts(key);
  const streak = streakInfo(state.history, key, targetFor, sportCredit);
  const thisW = weekStats(data, key, opts);
  const lastW = weekStats(data, addWeeks(key, -1), opts);
  const cons = consistency(data, key, 8, opts);
  const fr = freshnessNow();
  const todayLong = today().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const todays = ctx.todays;
  const todayOpen = todays && !ctx.isDone(todays);
  const remaining = Math.max(0, target - counted);

  // Stat cards: only numbers the app actually records.
  const stats = `
  <section class="stats-row" aria-label="Your training at a glance">
    <div class="stat">
      <span class="label">Sessions this week</span>
      <span class="num">${counted}<small>/ ${target}</small></span>
      <div class="meter" aria-hidden="true"><i style="--w:${target ? Math.round((counted / target) * 100) : 0}%"></i></div>
      <span class="stat-sub">${remaining ? `${plural(remaining, 'session')} to go` : 'Weekly target hit'}${credit ? ', one from sport' : ''}</span>
    </div>
    <div class="stat">
      <span class="label">Weekly streak</span>
      <span class="num">${streak.current}<small>${streak.current === 1 ? 'week' : 'weeks'}</small></span>
      <span class="stat-sub">${streak.longest > streak.current ? `Best so far: ${plural(streak.longest, 'week')}` : streak.current ? 'Your best yet' : 'Hit this week’s target to start one'}</span>
    </div>
    <div class="stat">
      <span class="label">Volume this week</span>
      ${thisW.weightedSets
        ? `<span class="num">${fmtNum(wt(thisW.volume))}<small>${unitLabel(units())}</small></span>
           <span class="stat-sub">${plural(thisW.sets, 'set')} logged${lastW.volume ? `. Last week: ${fmtNum(wt(lastW.volume))} ${unitLabel(units())}` : ''}</span>`
        : `<span class="num">${thisW.sets}<small>${thisW.sets === 1 ? 'set' : 'sets'}</small></span>
           <span class="stat-sub">${thisW.sets ? 'Bodyweight sets logged this week' : 'Tick sets in a workout to track volume'}</span>`}
    </div>
    <div class="stat">
      <span class="label">Consistency</span>
      ${cons.weeksJudged
        ? `<span class="num">${cons.weeksMet}<small>of ${plural(cons.weeksJudged, 'week')}</small></span>
           <div class="meter" aria-hidden="true"><i style="--w:${Math.round((cons.weeksMet / cons.weeksJudged) * 100)}%"></i></div>
           <span class="stat-sub">Finished weeks with your target hit, out of the last 8</span>`
        : `<span class="num">New</span><span class="stat-sub">Finish your first week to start tracking this</span>`}
    </div>
  </section>`;

  // Today's workout: the focal point.
  let hero;
  if (todays) {
    const short = ctx.isShort(todays);
    const list = shownExercises(todays, short);
    const done = ctx.isDone(todays);
    const logged = loggedSets(key, todays, short);
    const total = plannedSets(todays, short);
    const c = readiness(checkinFor(todays));
    hero = `<article class="hero" aria-labelledby="today-name">
      <p class="hero-when">${done ? 'Done today' : ctx.isPast(todays) ? `Today, was ${fmtTime(todays.start)}` : `Today, ${fmtTime(todays.start)} to ${fmtTime(ctx.endOf(todays))}`}</p>
      <h2 id="today-name">${esc(todays.name)}</h2>
      <dl class="hero-facts">
        <div><dt>Exercises</dt><dd class="num">${list.length}</dd></div>
        <div><dt>Sets</dt><dd class="num">${logged ? `${logged} of ${total}` : total}</dd></div>
        <div><dt>Duration</dt><dd class="num">${ctx.endOf(todays) - todays.start} min</dd></div>
        <div><dt>Status</dt><dd class="num">${done ? 'Done' : logged ? 'Started' : 'To do'}</dd></div>
      </dl>
      ${muscleChips(todays, fr)}
      ${sessionNotesHtml(ctx, todays)}
      ${!done ? `<p class="small ${c ? '' : 'muted'}">${c ? `Check-in: <b>${esc(c.title)}</b>. ${esc(c.text)}` : 'Not checked in yet. Rate your sleep, soreness and energy when you start, and Slotted adjusts the session.'}</p>` : ''}
      ${sessionActions(ctx, todays, true)}
      ${done ? '' : `<div class="ask-row">${askBtn('Should I adjust today’s session based on my recovery?')}</div>`}
    </article>`;
  } else {
    const nextS = ctx.nextUp;
    hero = `<article class="hero rest-day">
      <p class="hero-when">${sessions.length ? 'No gym session today' : 'Nothing planned yet'}</p>
      <h2>${sessions.length ? 'Rest day' : 'Let’s plan your week'}</h2>
      <p class="muted">${nextS ? `Next up: <b>${esc(nextS.name)}</b>, ${DAYS[nextS.day]} ${fmtTime(nextS.start)}.` : sessions.length ? 'Every session this week is done or past. Next week’s plan appears on Monday.' : 'Add school, sport and anything else in My week, and Slotted fits your sessions around them.'}</p>
      ${sessions.length ? checkinBlock(null) : ''}
      <div class="hero-actions">
        ${nextS ? `<a class="btn primary" href="${workoutHref(nextS)}">${icon('play')}Preview ${esc(nextS.name)}</a>` : ''}
        <a class="btn" href="${sessions.length ? '#plan' : '#week'}">${sessions.length ? 'Open this week' : 'Organise my week'}</a>
      </div>
    </article>`;
  }

  // Recovery, compact.
  const recovery = `<section class="card" aria-labelledby="rec-h">
    <div class="card-head"><h2 id="rec-h">Muscle recovery</h2><a href="#progress/recovery">Full map</a></div>
    ${recoveryBlock(fr, { compact: true })}
  </section>`;

  // The week as slots.
  const blocks = blocksFor(key);
  const stravaWeek = stravaFor(key);
  const slots = `<section class="card span" aria-labelledby="wk-h">
    <div class="card-head"><h2 id="wk-h">Your week</h2><a href="#plan">Full schedule</a></div>
    <div class="slots">${DAYS_SHORT.map((n, d) => {
      const s = sessions.find((x) => x.day === d);
      const sportBlock = blocks.find((b) => b.day === d && b.type === 'sport');
      const sport = !!sportBlock || stravaWeek.some((a) => a.day === d);
      const cls = [s ? 'has-session' : '', s && ctx.isDone(s) ? 'is-done' : '', s && !ctx.isDone(s) && ctx.isPast(s) ? 'is-missed' : '', d === tIdx ? 'is-today' : '', sport ? 'has-sport' : ''].filter(Boolean).join(' ');
      const status = s ? `${s.name}, ${statusOf(ctx, s).label.toLowerCase()}` : (state.restDays || []).includes(d) ? 'rest day' : 'no gym session';
      return `<a class="slot ${cls}" href="#plan/day-${d}" aria-label="${DAYS[d]} ${dayDate(key, d).getDate()}: ${esc(status)}${sport ? ', sport' : ''}">
        <span class="slot-top"><span class="slot-day">${n}</span><span class="slot-date">${dayDate(key, d).getDate()}</span></span>
        <span class="slot-bar" aria-hidden="true"></span>
        <span class="slot-name">${s ? esc(s.name) : sportBlock ? esc(sportBlock.label) : sport ? 'Activity' : 'Rest'}</span>
      </a>`;
    }).join('')}</div>
    <div class="slot-key" aria-hidden="true">
      <span><i style="background:var(--lime)"></i>Done</span>
      <span><i style="box-shadow:inset 0 0 0 1px var(--lime-line)"></i>Planned</span>
      <span><i style="background:var(--danger-soft);box-shadow:inset 0 0 0 1px var(--danger)"></i>Not done</span>
      <span><i style="background:var(--amber)"></i>Sport</span>
    </div>
  </section>`;

  // Upcoming activity: sessions and sport still ahead this week.
  const now = ctx.now;
  const ahead = [
    ...sessions.filter((s) => !ctx.isDone(s) && !ctx.isPast(s)).map((s) => ({ day: s.day, t: s.start, kind: 'train', s })),
    ...blocks.filter((b) => b.type === 'sport' && (b.day > tIdx || (b.day === tIdx && toMin(b.start) > now))).map((b) => ({ day: b.day, t: toMin(b.start), kind: 'sport', b })),
  ].sort((a, b) => a.day - b.day || a.t - b.t).slice(0, 5);
  const upcoming = `<section class="card" aria-labelledby="up-h">
    <div class="card-head"><h2 id="up-h">Coming up</h2><a href="#plan">This week</a></div>
    ${ahead.length ? `<ul class="uplist">${ahead.map((a) => {
      const date = dayDate(key, a.day);
      const when = `<span class="when"><b>${a.day === tIdx ? 'Today' : DAYS_SHORT[a.day]}</b><small>${date.getDate()} ${date.toLocaleDateString('en-AU', { month: 'short' })}</small></span>`;
      if (a.kind === 'train') {
        const n = shownExercises(a.s, ctx.isShort(a.s)).length;
        return `<li>${when}<a class="what" href="${workoutHref(a.s)}"><b><i class="dot" style="background:var(--lime)"></i>${esc(a.s.name)}</b><small>${fmtTime(a.s.start)}, ${plural(n, 'exercise')}</small></a><span class="badge ${statusOf(ctx, a.s).cls}">${statusOf(ctx, a.s).label}</span></li>`;
      }
      return `<li>${when}<span class="what"><b><i class="dot" style="background:var(--amber)"></i>${esc(a.b.label)}</b><small>${fmtTime(toMin(a.b.start))}${a.b.intensity === 'hard' ? ', game' : a.b.intensity === 'easy' ? ', easy session' : ''}</small></span><span class="badge sport">Sport</span></li>`;
    }).join('')}</ul>` : '<p class="muted">Nothing else planned this week.</p>'}
  </section>`;

  // Progress snapshot.
  const weeks6 = consistency(data, key, 6, opts).weeks;
  const prs = recentPRs(data, nameOfMove, 3);
  const snapshot = `<section class="card snapshot" aria-labelledby="snap-h">
    <div class="card-head" style="margin-bottom:0"><h2 id="snap-h">Progress</h2><a href="#progress">All progress</a></div>
    <div>
      <span class="label">Sessions per week</span>
      ${weeks6.length > 1 ? sessionBars(weeks6, key, true) : '<p class="small muted" style="margin-top:6px">Your weekly history builds from here.</p>'}
    </div>
    <div>
      <span class="label">Recent personal bests</span>
      ${prs.length ? `<ul class="pr-list" style="margin-top:8px">${prs.map((p) => `<li><b>${esc(p.name)}</b><span><span class="num">${esc(prText(p))}</span> <span class="muted small">${fmtDate(p.date)}</span></span></li>`).join('')}</ul>`
        : '<p class="small muted" style="margin-top:6px">Lift more than last time and your bests show here.</p>'}
    </div>
  </section>`;

  app.innerHTML = `
  <div class="home-head">
    <div>
      <h1>${esc(greeting())}</h1>
      <p class="page-sub">${todayLong}. ${counted} of ${plural(target, 'session')} done this week${state.useAB ? `, Week ${typeOf(key)}` : ''}.</p>
    </div>
    ${todayOpen ? `<a class="btn primary big" href="${workoutHref(todays)}">${icon('play')}${loggedSets(key, todays, ctx.isShort(todays)) ? 'Continue today’s workout' : 'Start today’s workout'}</a>` : ''}
  </div>
  ${installBanner()}
  ${(() => { const n = weekProposals(ctx).proposals.length; return n ? `<a class="card suggest-banner" href="#plan">${icon('spark')}<span><b>${n === 1 ? 'A suggested change' : `${n} suggested changes`} for your week</b><small>Based on your recovery and check-in. Open This week to accept or say no.</small></span></a>` : ''; })()}
  ${recapCard(key, ctx.nextUp, sessions.length)}
  ${stats}
  <div class="home-grid">
    ${hero}
    ${recovery}
    ${slots}
    ${upcoming}
    ${snapshot}
  </div>`;

  wireInstall();
  const recapClose = document.getElementById('recap-close');
  if (recapClose) recapClose.addEventListener('click', () => { state.recapSeen[key] = true; commit(); renderHome(); });
  wireSessionActions(renderHome);
  wireRecovery(renderHome, true);
  wireAsk();
}

// ---------- the focused workout ----------
let elapsedTimer = null;
const elapsedText = (t) => {
  if (!t || !t.start) return '';
  const mins = Math.max(0, Math.round(((t.end || Date.now()) - t.start) / 60000));
  return t.end ? `Took ${mins} min` : `${mins} min in`;
};

function renderWorkout() {
  const [sk, sub] = routeArgs;
  const ctx = weekCtx();
  const s = ctx.sessions.find((x) => x.key === sk);
  if (!s) {
    app.innerHTML = `<div class="wk"><section class="card empty-state"><h2>That session isn’t in this week’s plan</h2><p class="muted">It may have moved, or it was from an earlier week.</p><a class="btn primary" href="#plan">Open this week</a></section></div>`;
    return;
  }
  if (sub === 'done') { renderSummary(ctx, s); return; }
  const short = ctx.isShort(s);
  const done = ctx.isDone(s);
  const total = plannedSets(s, short);
  const logged = loggedSets(ctx.key, s, short);
  const fr = freshnessNow();
  const t = (ctx.entry.times || {})[s.key];
  const checkin = s.day === ctx.tIdx && !done;

  app.innerHTML = `
  <div class="wk">
    <div class="wk-top">
      <a class="btn ghost" href="#plan">${icon('back')}This week</a>
      <span class="elapsed" id="elapsed">${elapsedText(t)}</span>
    </div>
    <header class="wk-title">
      <p class="hero-when">${whenText(ctx, s)}${done ? '. Done' : ''}</p>
      <h1>${esc(s.name)}</h1>
      ${muscleChips(s, fr)}
      ${sessionNotesHtml(ctx, s)}
    </header>
    <div class="wk-progress">
      <div class="meter" aria-hidden="true"><i id="wk-meter" style="--w:${total ? Math.round((logged / total) * 100) : 0}%"></i></div>
      <span><b class="num" id="wk-count">${logged}</b> <span class="muted">of ${total} sets</span></span>
    </div>
    ${checkin ? checkinBlock(s) : ''}
    <ol class="xlist">${exerciseCards(s, ctx.key, short)}</ol>
    <div class="wk-foot" id="wk-foot">
      ${done
        ? `<a class="btn primary big" href="${workoutHref(s, true)}">See summary</a>`
        : `<button type="button" data-planned="${s.key}">Tick all as planned</button>
           <button type="button" class="primary big" id="finish">${icon('check')}Finish workout</button>`}
    </div>
  </div>`;

  wireSessionActions(renderWorkout, { workout: s.key });
  wireAsk();
  const finish = document.getElementById('finish');
  if (finish) finish.addEventListener('click', () => {
    const doFinish = () => {
      const entry = ctx.entry;
      if (!entry.done.includes(s.key)) entry.done = [...entry.done, s.key];
      entry.times = entry.times || {};
      const tt = entry.times[s.key] || (entry.times[s.key] = {});
      if (tt.start && !tt.end) tt.end = Date.now();
      commit();
      stopRest();
      location.hash = workoutHref(s, true);
    };
    if (loggedSets(ctx.key, s, short)) { doFinish(); return; }
    const foot = document.getElementById('wk-foot');
    foot.innerHTML = `<div class="confirm"><span>No sets ticked yet. Mark this session done anyway?</span><button type="button" class="primary" id="fin-yes">Mark done</button><button type="button" id="fin-no">Keep going</button></div>`;
    document.getElementById('fin-yes').addEventListener('click', doFinish);
    document.getElementById('fin-no').addEventListener('click', renderWorkout);
  });
  clearInterval(elapsedTimer);
  if (t && t.start && !t.end) {
    elapsedTimer = setInterval(() => {
      const el = document.getElementById('elapsed');
      if (!el) { clearInterval(elapsedTimer); return; }
      el.textContent = elapsedText((weekCtx().entry.times || {})[s.key]);
    }, 30000);
  }
}

function renderSummary(ctx, s) {
  if (!ctx.isDone(s)) { location.replace(workoutHref(s)); return; }
  const data = { history: { [ctx.key]: ctx.entry }, log: { [ctx.key]: (state.log || {})[ctx.key] || {} } };
  const w = completedWorkouts(data, nameOfMove).find((x) => x.key === s.key) || { exercises: [], sets: 0, volume: 0, minutes: null };
  // A personal best is judged the way the exercise is tracked: heavier, more reps, longer or further.
  const prs = w.exercises.map((x) => {
    const bt = bestTrack(x);
    const before = setsOutside(x.move, x.track, { w: ctx.key, s: s.key, whole: true });
    let found = null;
    for (const y of x.sets) {
      const kind = newBest(bt, before, y);
      if (kind) found = { kind, set: y };
    }
    return found ? { name: x.name, text: setText(found.set, x.track, units()), kind: found.kind } : null;
  }).filter(Boolean);
  const streak = streakInfo(state.history, ctx.key, targetFor, sportCredit);
  const remaining = Math.max(0, ctx.target - ctx.counted);
  const nextS = ctx.nextUp;

  app.innerHTML = `
  <div class="wk">
    <div class="wk-top"><a class="btn ghost" href="#home">${icon('back')}Home</a></div>
    <section class="card done-hero">
      <span class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <h1>${esc(s.name)} done</h1>
      <p class="muted">${streak.thisWeekMet
        ? `Weekly target hit. That’s ${plural(streak.current, 'week')} in a row.`
        : `${ctx.counted} of ${plural(ctx.target, 'session')} this week. ${remaining} more to hit your target.`}</p>
      <div class="summary-stats" style="width:100%">
        <div class="kpi"><span class="label">Sets</span><span class="num">${w.sets}</span></div>
        <div class="kpi"><span class="label">Volume</span><span class="num">${w.volume ? fmtNum(wt(w.volume)) : '0'}<small>${unitLabel(units())}</small></span></div>
        <div class="kpi"><span class="label">Exercises</span><span class="num">${w.exercises.length}</span></div>
        <div class="kpi"><span class="label">Time</span><span class="num">${w.minutes ? `${w.minutes}<small>min</small>` : '<small>Not timed</small>'}</span></div>
      </div>
    </section>
    ${prs.length ? `<section class="card" style="margin-top:14px"><div class="card-head"><h2>New personal bests</h2></div>
      <ul class="pr-list">${prs.map((p) => `<li><b>${esc(p.name)}</b><span><span class="num">${esc(p.text)}</span> <span class="small" style="color:var(--lime-text)">${{ kg: 'Heaviest yet', reps: 'Most reps yet', sec: 'Longest yet', m: 'Furthest yet' }[p.kind]}</span></span></li>`).join('')}</ul></section>` : ''}
    ${w.exercises.length ? `<section class="card" style="margin-top:14px"><div class="card-head"><h2>What you did</h2></div>
      <div class="hist-body" style="padding:0"><table><tbody>${w.exercises.map((x) => `<tr><td>${esc(x.name)}${effortHtml(s.key, x.move, ((state.log[ctx.key] || {})[s.key] || {})[x.move], x.name)}</td><td>${esc(setsText(x.sets, x.track, units()))}</td></tr>`).join('')}</tbody></table></div></section>`
      : `<p class="muted" style="margin-top:14px">Marked done without logging sets, so it counts toward your week but not your lift history.</p>`}
    <div class="actions" style="margin-top:20px">
      <a class="btn primary big" href="#home">Back to home</a>
      <a class="btn" href="#progress">See progress</a>
      ${nextS ? `<span class="muted small">Next up: ${esc(nextS.name)}, ${DAYS[nextS.day]} ${fmtTime(nextS.start)}</span>` : ''}
    </div>
  </div>`;
  wireEffort(renderWorkout, ctx.key);
}

// ---------- rest timer ----------
// Starts when a set is ticked. Lives outside the page content so it survives re-renders.
let rest = null; // { end, total, next, done }
let restTick = null;
let wakeLock = null;
let audioCtx = null;

function nextSetLabel(s, shown, key) {
  const log = (state.log && state.log[key] && state.log[key][s.key]) || {};
  for (const x of shown) {
    const done = doneSets(log[x.move]).length;
    if (done < x.sets) return `${x.name}, set ${done + 1} of ${x.sets}`;
  }
  return '';
}

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch { /* no sound available */ }
}

async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}

function restEl() {
  let el = document.getElementById('rest');
  if (!el) {
    el = document.createElement('section');
    el.id = 'rest';
    el.className = 'rest';
    el.setAttribute('aria-label', 'Rest timer');
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rest]');
      if (!b || !rest) return;
      const a = b.dataset.rest;
      if (a === 'skip') stopRest();
      else { rest.end = Math.max(Date.now() + 1000, rest.end + Number(a) * 1000); rest.total = Math.max(rest.total + Number(a), 1); drawRest(); }
    });
  }
  return el;
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function drawRest() {
  const el = restEl();
  if (!rest) { el.hidden = true; return; }
  const left = Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));
  if (left === 0 && !rest.done) {
    rest.done = true;
    if (state.restMode !== 'silent') beep();
    try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch { /* ignore */ }
    setTimeout(() => { if (rest && rest.done) stopRest(); }, 6000);
  }
  const pct = rest.total ? Math.min(100, ((rest.total - left) / rest.total) * 100) : 100;
  el.hidden = false;
  el.classList.toggle('over', rest.done);
  el.innerHTML = `
    <div class="rest-bar" style="--p:${pct}%"></div>
    <div class="rest-body">
      <div class="rest-time" role="timer" aria-live="off">${rest.done ? 'Go' : mmss(left)}</div>
      <div class="rest-text">
        <b>${rest.done ? 'Rest done' : 'Resting'}</b>
        ${rest.next ? `<span>Next: ${esc(rest.next)}</span>` : ''}
      </div>
      <div class="rest-actions">
        ${rest.done ? '' : '<button type="button" data-rest="-15" aria-label="15 seconds less">−15</button><button type="button" data-rest="15" aria-label="15 seconds more">+15</button>'}
        <button type="button" class="primary" data-rest="skip">${rest.done ? 'Close' : 'Skip'}</button>
      </div>
    </div>`;
}

function startRest(seconds, next) {
  if (state.restMode === 'off' || !seconds) return;
  if (state.restMode !== 'silent') { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* ignore */ } }
  rest = { end: Date.now() + seconds * 1000, total: seconds, next, done: false };
  document.body.classList.add('resting');
  clearInterval(restTick);
  restTick = setInterval(drawRest, 250);
  keepAwake(true);
  drawRest();
}

function stopRest() {
  rest = null;
  document.body.classList.remove('resting');
  clearInterval(restTick);
  restTick = null;
  keepAwake(false);
  drawRest();
}

// ---------- muscle freshness ----------
// Built only from recorded data: ticked sets, sessions marked done, and Strava activities.
// The model itself lives in freshness.js and is unchanged; this is how it's shown.
function exerciseInfo() {
  const map = {};
  for (const w of (state.routine && state.routine.workouts) || []) {
    for (const e of w.exercises || []) if (e.name) map[exerciseKey(e.name)] = { name: e.name, group: e.group };
  }
  return (move) => map[move] || { name: moveName(move, state.profile.equipment) };
}

function freshnessNow({ withStrava = true, at = null } = {}) {
  return computeFreshness({
    log: state.log || {},
    history: state.history || {},
    weekStart: keyToDate,
    exercise: exerciseInfo(),
    activities: withStrava ? stravaFor(currentWeek()).map((a) => ({ ...a })) : [],
    now: at || today(),
  });
}

const sinceText = (d) => {
  if (!d) return 'Not worked in the last 7 days';
  const days = Math.floor((today().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? 'Worked today' : days === 1 ? 'Worked yesterday' : `Worked ${DAYS[(new Date(d).getDay() + 6) % 7]}`;
};

function etaText(h) {
  if (h === 0) return 'Recovered now';
  if (h === null) return 'Not within the next week';
  if (h <= 12) return `In about ${h} hours`;
  const d = new Date(today().getTime() + h * 36e5);
  const part = d.getHours() < 12 ? 'morning' : d.getHours() < 17 ? 'afternoon' : 'evening';
  const dayIdx = (d.getDay() + 6) % 7;
  return `By ${dayIdx === (todayIndex() + 1) % 7 ? 'tomorrow' : DAYS[dayIdx]} ${part}`;
}

let selectedMuscle = null;

function bodySvg(side, lv, labels, sel, nodata) {
  const shapes = side === 'Front' ? FRONT : BACK;
  const polys = shapes.map(({ muscle, points }) => points.map((pts) => (muscle
    ? `<polygon points="${pts}" class="m l${lv[muscle]}${nodata ? ' nodata' : ''}${sel === muscle ? ' sel' : ''}" data-muscle="${muscle}"><title>${esc(labels[muscle])}</title></polygon>`
    : `<polygon points="${pts}" class="b"/>`)).join('')).join('');
  return `<figure class="body"><svg viewBox="-20 -20 1040 2240" role="img" class="${sel ? 'has-sel' : ''}" aria-label="${side} of the body, muscles shaded by how recently they were worked">${polys}</svg><figcaption>${side}</figcaption></figure>`;
}

let selectedPart = null;
const ROLE_WORD = { primary: 'main', secondary: 'helper', stabiliser: 'stabiliser' };

// A group's detail: its own summary and each detailed muscle in it, any of which can be opened.
function muscleDetail(fr, id) {
  const m = fr.muscles.find((x) => x.id === id);
  if (!m) return '';
  const parts = (fr.detail || []).filter((p) => p.group === id).sort((a, b) => a.fresh - b.fresh || a.label.localeCompare(b.label));
  const work = muscleWork(trainingData(), id, today(), 7, exerciseInfo());
  const h = fr.hasData ? hoursUntilFresh((d) => freshnessNow({ at: d }).muscles.find((x) => x.id === id).fresh, today()) : null;
  const open = parts.some((p) => p.id === selectedPart) ? selectedPart : null;
  return `<div class="mdetail" aria-live="polite">
    <div class="mdetail-head">
      <div><h3>${m.label}</h3><p class="small muted">${LEVEL_LABELS[freshnessLevel(m.fresh)]}. ${sinceText(m.lastWorked)}.</p></div>
      <span class="num">${m.fresh}%</span>
    </div>
    <p class="small"><b>Likely recovered:</b> ${etaText(h)}</p>
    ${parts.length > 1 ? `<div><span class="label">Each muscle${m.fresh < 100 ? ', most tired first' : ''}</span>
      <div class="parts">${parts.map((p) => `<button type="button" class="part" data-part="${p.id}" aria-expanded="${open === p.id}">
        <i class="sw l${freshnessLevel(p.fresh)}" aria-hidden="true"></i><span>${esc(p.label)}</span><b>${p.fresh}%</b></button>
        ${open === p.id ? partDetail(fr, p) : ''}`).join('')}</div></div>`
      : parts.length === 1 ? partDetail(fr, parts[0], true) : ''}
    ${parts.length > 1 ? (work.length ? `<div><span class="label">Logged in the last 7 days</span><ul style="margin-top:6px">${work.map((w) => `<li><span>${esc(w.name)}${w.main ? '' : ' <span class="faint">(helper)</span>'}</span><span>${plural(w.sets, 'set')}, ${w.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span></li>`).join('')}</ul></div>`
      : `<p class="small muted">No logged sets hit your ${m.label.toLowerCase()} in the last 7 days${fr.activities ? '. Strava activities may still count toward this' : ''}.</p>`) : ''}
    <div class="ask-row">${askBtn(`My ${m.label.toLowerCase()} are ${m.fresh}% recovered. Should I change my next session?`, `Ask the coach about my ${m.label.toLowerCase()}`)}</div>
  </div>`;
}

// One detailed muscle: freshness, when it should be recovered, what worked it, recent volume and the trend.
function partDetail(fr, p, inline = false) {
  const data = trainingData();
  const now = today();
  const info = exerciseInfo();
  const work = partWork(data, p.id, now, 14, info);
  const thisWeek = partVolume(data, p.id, now.getTime() - 7 * 864e5, now.getTime(), info);
  const lastWeek = partVolume(data, p.id, now.getTime() - 14 * 864e5, now.getTime() - 7 * 864e5 - 1, info);
  const h = p.fresh >= 85 ? 0 : hoursUntilFresh((d) => freshnessNow({ at: d }).detail.find((x) => x.id === p.id).fresh, now);
  // Freshness at the end of each of the last 7 days (today: now).
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    if (i < 6) { d.setDate(d.getDate() - (6 - i)); d.setHours(23, 59, 0, 0); }
    return { d, fresh: freshnessNow({ at: d }).detail.find((x) => x.id === p.id).fresh };
  });
  return `<div class="partdetail${inline ? ' inline' : ''}">
    ${inline ? '' : `<p class="small"><b>${p.fresh}% recovered.</b> ${LEVEL_LABELS[freshnessLevel(p.fresh)]}. ${sinceText(p.lastWorked)}.</p>`}
    ${p.fresh < 85 ? `<p class="small"><b>Likely recovered:</b> ${etaText(h)}</p>` : ''}
    <div class="trend" role="img" aria-label="${esc(p.label)} freshness over the last 7 days: ${trend.map((t) => `${DAYS_SHORT[(t.d.getDay() + 6) % 7]} ${t.fresh}%`).join(', ')}">
      ${trend.map((t, i) => `<span class="tcol"><span class="tbar"><i class="l${freshnessLevel(t.fresh)}" style="--h:${Math.max(4, t.fresh)}%"></i></span><small>${i === 6 ? 'Now' : DAYS_SHORT[(t.d.getDay() + 6) % 7].slice(0, 2)}</small></span>`).join('')}
    </div>
    <p class="small muted">Recent volume: <b>${plural(thisWeek, 'set')}</b> in the last 7 days, ${lastWeek} the week before. Helper sets count half.</p>
    ${work.length ? `<ul class="partwork">${work.slice(0, 6).map((w) => `<li><span>${esc(w.name)} <span class="faint">(${ROLE_WORD[w.role] || 'helper'})</span></span><span>${plural(w.sets, 'set')}, ${w.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span></li>`).join('')}</ul>`
      : '<p class="small muted">Nothing logged for this muscle in the last 2 weeks.</p>'}
  </div>`;
}

// The recovery map with a list. Compact on Home; full, with a detail panel, on Progress.
function recoveryBlock(fr, { compact = false } = {}) {
  const nodata = !fr.hasData;
  const lv = Object.fromEntries(fr.muscles.map((m) => [m.id, freshnessLevel(m.fresh)]));
  const labels = Object.fromEntries(fr.muscles.map((m) => [m.id, nodata ? `${m.label}: no recent training logged` : `${m.label}: ${m.fresh}% recovered`]));
  const sorted = fr.muscles.slice().sort((a, b) => a.fresh - b.fresh || a.label.localeCompare(b.label));
  const sel = compact ? null : selectedMuscle;
  const list = compact ? sorted.slice(0, 4) : sorted;
  const sources = [
    fr.sets ? plural(fr.sets, 'logged set') : '',
    fr.activities ? plural(fr.activities, 'Strava activity', 'Strava activities') : '',
  ].filter(Boolean).join(' and ');
  return `<div class="recovery${compact ? ' compact' : ''}">
    <div class="bodies">${bodySvg('Front', lv, labels, sel, nodata)}${bodySvg('Back', lv, labels, sel, nodata)}</div>
    <div>
      ${nodata
        ? `<p class="small">No training logged in the last 7 days, so there’s nothing to estimate yet. Finish a workout and your recovery shows here.</p>`
        : `<div class="mlist">${list.map((m) => `<button type="button" class="mrow" data-muscle="${m.id}" aria-pressed="${sel === m.id}">
            <i class="sw l${freshnessLevel(m.fresh)}" aria-hidden="true"></i>
            <span class="mname">${m.label}<small>${LEVEL_LABELS[freshnessLevel(m.fresh)]}. ${sinceText(m.lastWorked)}</small></span>
            <span class="mpct">${m.fresh}%</span>
          </button>`).join('')}</div>`}
      ${sel && !nodata ? muscleDetail(fr, sel) : ''}
      ${nodata ? '' : `<div class="rec-key" aria-hidden="true">${[0, 1, 2, 3].map((l) => `<span><i class="sw l${l}"></i>${LEVEL_LABELS[l]}</span>`).join('')}</div>`}
      <p class="rec-note">${nodata ? '' : `Estimated from ${sources} in the last 7 days. `}An estimate from your recorded training, not a medical measurement.</p>
    </div>
  </div>`;
}

function wireRecovery(rerender, openFull = false) {
  app.querySelectorAll('[data-muscle]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.muscle;
    if (openFull) { selectedMuscle = id; location.hash = '#progress/recovery'; return; }
    selectedMuscle = selectedMuscle === id ? null : id;
    selectedPart = null;
    rerender();
  }));
  app.querySelectorAll('[data-part]').forEach((el) => el.addEventListener('click', () => {
    selectedPart = selectedPart === el.dataset.part ? null : el.dataset.part;
    rerender();
  }));
}

// Which muscles a session mainly works, with their freshness, for session cards.
function sessionFreshness(s, fr) {
  const info = exerciseInfo();
  const ids = new Set();
  for (const x of shownExercises(s, false)) {
    const i = info(x.move) || {};
    for (const [id, w] of Object.entries(musclesFor(x.move, x.name || i.name, i.group))) if (w >= 1) ids.add(id);
  }
  return fr.muscles.filter((m) => ids.has(m.id));
}

// ---------- progress ----------
let selectedMove = null;
const fmtDay = (d) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
// A personal best ({ move, kg, reps, sec, m }) written for its tracking type, in the user's unit.
const prText = (p) => setText({ kg: p.kg || 0, reps: p.reps || 0, sec: p.sec || 0, m: p.m || 0 }, trackOf(exerciseForMove(p.move)), units());

// One series over time: estimated 1-rep max (or best reps for bodyweight work).
// Drawn after layout at the container's real width, so text and dots stay true size.
let chartPts = null;

function progressChart(list, kind, name) {
  const unit = kindUnit(kind, units());
  chartPts = list.map((s) => ({
    date: s.date, v: Number(chartValue(kind, s, units())) || 0, pr: s.pr,
    label: fmtDay(s.date), sets: setsText(s.sets, s.track, units()), unit,
  }));
  const caption = chartCaption(kind, list.find((s) => s.e1rm), units());
  if (chartPts.length < 2) {
    chartPts = null;
    return `<p class="muted small chart-empty">Log ${esc(name)} again and your trend line appears here.</p>`;
  }
  return `
  <figure class="chart">
    <figcaption class="small muted">${esc(caption)}. Hollow dots are personal bests.</figcaption>
    <div class="chart-wrap" id="chartwrap" aria-label="${esc(name)}: ${esc(caption.toLowerCase())} over time"></div>
  </figure>`;
}

function drawChart() {
  const wrap = document.getElementById('chartwrap');
  if (!wrap || !chartPts) return;
  const pts = chartPts;
  const W = Math.max(260, wrap.clientWidth), H = 200, L = 40, R = 14, T = 12, B = 28;
  const t0 = +pts[0].date, t1 = +pts[pts.length - 1].date;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = Math.max(1, (hi - lo) * 0.15);
  lo = Math.max(0, lo - pad); hi += pad;
  const stepRaw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(stepRaw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= stepRaw);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = (d) => L + (t1 === t0 ? 0.5 : (+d - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const fmtV = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const hits = pts.map((p, i) => {
    const a = i ? (x(pts[i - 1].date) + x(p.date)) / 2 : L;
    const b = i < pts.length - 1 ? (x(p.date) + x(pts[i + 1].date)) / 2 : W - R;
    return `<rect class="hit" x="${a}" y="0" width="${Math.max(1, b - a)}" height="${H}" data-i="${i}"/>`;
  }).join('');
  wrap.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
      ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick-l" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmtV(v)}</text>`).join('')}
      <text class="tick-l" x="${L}" y="${H - 8}" text-anchor="start">${esc(fmtDate(pts[0].date))}</text>
      <text class="tick-l" x="${W - R}" y="${H - 8}" text-anchor="end">${esc(fmtDate(pts[pts.length - 1].date))}</text>
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <path class="line" d="${path}"/>
      ${pts.map((p, i) => `<circle class="pt${p.pr ? ' pr' : ''}" cx="${x(p.date)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 5 : 4}"/>`).join('')}
      ${hits}
    </svg>
    <div class="tip" hidden></div>`;
  const tip = wrap.querySelector('.tip');
  const cross = wrap.querySelector('.cross');
  const show = (i) => {
    const p = pts[i];
    tip.innerHTML = `<b>${esc(p.label)}</b><span>${esc(fmtV(p.v))} ${esc(p.unit)}</span><small>${esc(p.sets)}</small>${p.pr ? '<em>Personal best</em>' : ''}`;
    tip.hidden = false;
    const cx = x(p.date);
    tip.style.left = `${Math.min(Math.max(cx, 80), W - 80)}px`;
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
  };
  wrap.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('pointerenter', () => show(Number(r.dataset.i)));
    r.addEventListener('pointerdown', () => show(Number(r.dataset.i)));
  });
  wrap.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

let progressPeriod = 12; // weeks, or 'all'
let historyShown = 12;

// Weekly training volume as bars.
function volumeBars(weeks, currentKey) {
  weeks = weeks.map((w) => ({ ...w, volume: Math.round(Number(wt(w.volume)) || 0) }));
  const max = Math.max(1, ...weeks.map((w) => w.volume));
  const every = weeks.length > 14 ? Math.ceil(weeks.length / 10) : 1;
  return `<div class="bars" role="img" aria-label="Volume per week in ${units() === 'lb' ? 'pounds' : 'kilograms'}: ${weeks.map((w) => `${fmtDate(keyToDate(w.key))} ${w.volume}`).join(', ')}">
    ${weeks.map((w, i) => {
      const cur = w.key === currentKey;
      const label = barLabel(weeks, i, every, cur);
      return `<div class="bar-col${cur ? ' current' : ''}"><div class="bar"><span class="bar-fill" style="--h:${(w.volume / max) * 100}%"></span>${w.volume ? `<span class="bar-val" style="--h:${(w.volume / max) * 100}%">${fmtK(w.volume)}</span>` : ''}</div><span class="bar-label">${label}</span></div>`;
    }).join('')}
  </div>`;
}

function renderProgress() {
  const ctx = weekCtx();
  const key = ctx.key;
  const data = trainingData();
  const opts = statsOpts(key);
  const all = collectHistory(state.log, state.history);
  const moves = Object.keys(all).sort((a, b) => all[b][all[b].length - 1].date - all[a][all[a].length - 1].date);
  const fr = freshnessNow();
  const cons = consistency(data, key, progressPeriod, opts);
  const keys = cons.weeks.map((w) => w.key);
  const fromTime = keyToDate(keys[0]).getTime();
  const streak = streakInfo(state.history, key, targetFor, sportCredit);
  const missed = missedSessions(data, keys, key, ctx.tIdx, ctx.now);
  const last30 = sessionsSince(data, today(), 30);
  const workouts = completedWorkouts(data, nameOfMove, (k) => sessionInfo(k).name).filter((w) => w.date.getTime() >= fromTime);
  const records = personalRecords(data, nameOfMove);
  const msets = muscleSets(data, fromTime, today().getTime(), exerciseInfo());
  const mmax = Math.max(1, ...Object.values(msets));
  const periodLabel = progressPeriod === 'all' ? 'all time' : `the last ${progressPeriod} weeks`;
  const periodSets = cons.weeks.reduce((t, w) => t + w.sets, 0);
  const periodVolume = cons.weeks.reduce((t, w) => t + w.volume, 0);

  // Strength: the lift list and the selected lift.
  let strength;
  if (!moves.length) {
    strength = `<section class="card empty-state"><h2>No lifts logged yet</h2><p class="muted">Tick sets during a workout and each exercise gets its own history, strength trend and personal bests.</p><a class="btn primary" href="#plan">Open this week</a></section>`;
  } else {
    if (!selectedMove || !all[selectedMove]) selectedMove = moves[0];
    const list = all[selectedMove];
    const sum = summarise(list);
    const name = nameOfMove(selectedMove);
    const changeText = (s) => {
      if (s.sessions < 2 || !s.change) return '';
      const amount = s.kind === 'kg' ? wt(Math.abs(s.change)) : Math.abs(s.change);
      return `${s.change > 0 ? '+' : '−'}${amount} ${kindUnit(s.kind, units())}`;
    };
    strength = `<div class="lifts">
      <nav class="card exlist" aria-label="Exercises">
        ${moves.map((m) => {
          const s = summarise(all[m]);
          const ch = changeText(s);
          return `<button type="button" class="exitem" data-move="${m}" aria-current="${m === selectedMove}">
            <span class="exname">${esc(nameOfMove(m))}</span>
            <span class="exmeta">Best ${esc(setText(s.best, all[m][0].track, units()))}${ch ? `<b class="${s.change > 0 ? 'gain' : ''}">${ch}</b>` : ''}</span>
          </button>`;
        }).join('')}
      </nav>
      <section class="card exdetail" id="detail" tabindex="-1">
        <h3 style="font-size:24px">${esc(name)}</h3>
        <dl class="dl-stats">
          <div><dt>Best set</dt><dd class="num">${esc(setText(sum.best, list[0].track, units()))}</dd></div>
          ${sum.bestE1rm ? `<div><dt>Estimated 1-rep max</dt><dd class="num">${wt(sum.bestE1rm)} ${unitLabel(units())}</dd></div>` : ''}
          <div><dt>Sessions</dt><dd class="num">${sum.sessions}</dd></div>
          ${sum.sessions > 1 ? `<div><dt>Since ${esc(fmtDate(sum.since))}</dt><dd class="num">${changeText(sum) || 'No change'}</dd></div>` : ''}
        </dl>
        ${progressChart(list, sum.kind, name)}
        <div>
          <span class="label">History</span>
          <ol class="hist-list" style="margin-top:6px">
            ${list.slice().reverse().slice(0, 10).map((s) => `<li class="uplist-like" style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;flex-wrap:wrap">
              <span class="muted small" style="min-width:110px">${esc(fmtDay(s.date))}</span>
              <span style="flex:1;font-variant-numeric:tabular-nums">${esc(setsText(s.sets, s.track, units()))}</span>
              ${s.pr ? '<span class="badge done">Personal best</span>' : ''}
            </li>`).join('')}
          </ol>
        </div>
        <div class="ask-row">${askBtn(`How has my ${name.toLowerCase()} improved, and what should I do next to keep progressing?`, `Ask the coach about my ${name.toLowerCase()}`)}</div>
      </section>
    </div>`;
  }

  app.innerHTML = `
  <div class="page-head">
    <div>
      <h1>Progress</h1>
      <p class="page-sub">Everything here comes from the sessions and sets you’ve recorded.</p>
    </div>
    <div class="seg" role="group" aria-label="Time period">
      ${[[4, '4 weeks'], [12, '12 weeks'], ['all', 'All time']].map(([v, t]) => `<button type="button" data-period="${v}" aria-pressed="${progressPeriod === v}">${t}</button>`).join('')}
    </div>
  </div>
  <nav class="jump" aria-label="Sections">
    <a href="#sec-consistency" data-jump>Consistency</a><a href="#sec-recovery" data-jump>Recovery</a><a href="#sec-strength" data-jump>Strength</a>
    <a href="#sec-volume" data-jump>Volume</a><a href="#sec-records" data-jump>Records</a><a href="#sec-history" data-jump>History</a>
  </nav>

  <section class="prog-sec" id="sec-consistency" aria-labelledby="h-cons">
    <div class="sec-head" style="margin-top:28px"><h2 id="h-cons">Consistency</h2></div>
    <div class="kpis">
      <div class="kpi"><span class="label">This week</span><span class="num">${ctx.counted}<small>/ ${ctx.target}</small></span></div>
      <div class="kpi"><span class="label">Last 30 days</span><span class="num">${last30}<small>${last30 === 1 ? 'session' : 'sessions'}</small></span></div>
      <div class="kpi"><span class="label">Weekly streak</span><span class="num">${streak.current}<small>best ${streak.longest}</small></span></div>
      <div class="kpi"><span class="label">Target hit</span>${cons.weeksJudged ? `<span class="num">${cons.weeksMet}<small>of ${plural(cons.weeksJudged, 'week')}</small></span>` : '<span class="num"><small>No finished weeks yet</small></span>'}</div>
      <div class="kpi"><span class="label">Done and missed</span><span class="num">${cons.completed}<small>done, ${missed} missed</small></span></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Sessions per week</h3><span class="label">${periodLabel}</span></div>
      ${cons.weeks.length > 1 ? sessionBars(cons.weeks, key) : `<p class="muted small">One week recorded so far. The chart fills in as the weeks go by.</p>${sessionBars(cons.weeks, key)}`}
      <div class="bars-key"><span><i></i>Target hit</span><span><i style="background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)"></i>Short of target</span><span><i class="target"></i>Weekly target</span></div>
    </div>
  </section>

  <section class="prog-sec" id="sec-recovery" aria-labelledby="h-rec">
    <div class="sec-head"><h2 id="h-rec">Muscle recovery</h2></div>
    <div class="card">${recoveryBlock(fr)}</div>
  </section>

  <section class="prog-sec" id="sec-strength" aria-labelledby="h-str">
    <div class="sec-head"><h2 id="h-str">Strength</h2></div>
    ${strength}
  </section>

  <section class="prog-sec" id="sec-volume" aria-labelledby="h-vol">
    <div class="sec-head"><h2 id="h-vol">Training volume</h2><span class="label">${periodLabel}</span></div>
    <div class="two-col">
      <div class="card">
        <div class="card-head"><h3>Volume per week</h3><span class="label">${fmtNum(wt(periodVolume))} ${unitLabel(units())}, ${plural(periodSets, 'set')}</span></div>
        ${periodVolume ? volumeBars(cons.weeks, key) : `<p class="muted small">Weighted sets you tick add up here as ${units() === 'lb' ? 'pounds' : 'kilograms'} lifted (weight × reps). Timed and distance work isn’t counted.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>Sets by muscle</h3></div>
        ${Object.values(msets).some((v) => v > 0) ? `<div class="hbars">${MUSCLES.slice().sort((a, b) => msets[b.id] - msets[a.id]).map((m) => `
          <div class="hbar"><span>${m.label}</span><span class="track"><i style="--w:${(msets[m.id] / mmax) * 100}%"></i></span><span class="v">${Math.round(msets[m.id])}</span></div>`).join('')}</div>
          <p class="rec-note">Main muscles count a full set. Helper muscles count part of one, the same way recovery is estimated.</p>`
          : '<p class="muted small">Tick sets during workouts to see which muscles get the most work.</p>'}
      </div>
    </div>
  </section>

  <section class="prog-sec" id="sec-records" aria-labelledby="h-rec2">
    <div class="sec-head"><h2 id="h-rec2">Personal records</h2></div>
    <div class="card">
      ${records.length ? `<table class="records">
        <thead><tr><th>Exercise</th><th>Best set</th><th class="hide-sm">Est. 1-rep max</th><th>Date</th></tr></thead>
        <tbody>${records.map((r) => `<tr><td>${esc(r.name)}</td><td><span class="num">${esc(setText(r.best, trackOf(exerciseForMove(r.move)), units()))}</span></td><td class="hide-sm">${r.e1rm ? `${wt(r.e1rm)} ${unitLabel(units())}` : `<span class="faint">${{ sec: 'Timed', m: 'Distance' }[r.kind] || (r.kind === 'kg' ? 'Not estimated' : 'Bodyweight')}</span>`}</td><td>${fmtDate(r.date)}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted small">Your best set for each exercise shows here once you’ve logged it.</p>'}
    </div>
  </section>

  <section class="prog-sec" id="sec-history" aria-labelledby="h-hist">
    <div class="sec-head"><h2 id="h-hist">Workout history</h2><span class="label">${plural(workouts.length, 'session')}, ${periodLabel}</span></div>
    <div class="card" style="padding-top:8px;padding-bottom:8px">
      ${workouts.length ? `<ol class="hist-list">${workouts.slice(0, historyShown).map((w) => `<li><details class="hist">
        <summary><span class="h-date">${esc(fmtDay(w.date))}</span><span class="h-name">${esc(w.name)}</span><span class="h-meta">${w.sets ? `${plural(w.sets, 'set')}${w.volume ? `, ${fmtNum(wt(w.volume))} ${unitLabel(units())}` : ''}` : 'Not logged'}</span></summary>
        <div class="hist-body">${w.exercises.length ? `<table><tbody>${w.exercises.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(setsText(x.sets, x.track, units()))}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Marked done without logging sets.</p>'}${w.minutes ? `<p class="small muted">Took ${w.minutes} min.</p>` : ''}</div>
      </details></li>`).join('')}</ol>
      ${workouts.length > historyShown ? `<button type="button" class="ghost more-btn" id="hist-more">Show ${Math.min(12, workouts.length - historyShown)} more</button>` : ''}`
      : `<p class="muted small" style="padding:12px 0">No completed workouts in ${periodLabel}. Finish one and it’s listed here.</p>`}
    </div>
  </section>`;

  app.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    progressPeriod = b.dataset.period === 'all' ? 'all' : Number(b.dataset.period);
    historyShown = 12;
    renderProgress();
  }));
  app.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
    selectedMove = b.dataset.move;
    renderProgress();
    if (window.matchMedia('(max-width: 860px)').matches) document.getElementById('detail').scrollIntoView({ block: 'start' });
  }));
  app.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const more = document.getElementById('hist-more');
  if (more) more.addEventListener('click', () => { historyShown += 12; renderProgress(); });
  wireRecovery(renderProgress);
  wireAsk();
  drawChart();
  if (routeArgs[0] === 'recovery') {
    routeArgs = [];
    requestAnimationFrame(() => document.getElementById('sec-recovery').scrollIntoView({ block: 'start' }));
  }
}

// ---------- your own routine ----------
const ex = (name, sets, reps, group) => ({ name, sets, reps, group });
const TEMPLATES = {
  arnold: { label: 'Arnold split', workouts: [
    { name: 'Chest and back', exercises: [ex('Bench press', 4, '6–8', 'chest'), ex('Incline dumbbell press', 3, '8–10', 'chest'), ex('Pull-up', 4, '6–10', 'back'), ex('Barbell row', 4, '6–8', 'back'), ex('Chest fly', 3, '12', 'chest')] },
    { name: 'Shoulders and arms', exercises: [ex('Overhead press', 4, '6–8', 'shoulders'), ex('Lateral raise', 3, '12–15', 'shoulders'), ex('Barbell curl', 3, '8–10', 'arms'), ex('Skull crusher', 3, '8–10', 'arms'), ex('Hammer curl', 3, '10–12', 'arms')] },
    { name: 'Legs', exercises: [ex('Barbell back squat', 4, '5–8', 'legs'), ex('Romanian deadlift', 3, '8–10', 'legs'), ex('Leg press', 3, '10–12', 'legs'), ex('Leg curl', 3, '10–12', 'legs'), ex('Standing calf raise', 4, '12–15', 'legs')] },
  ] },
  ppl: { label: 'Push, pull, legs', workouts: [
    { name: 'Push', exercises: [ex('Bench press', 4, '6–8', 'chest'), ex('Overhead press', 3, '8–10', 'shoulders'), ex('Incline dumbbell press', 3, '8–10', 'chest'), ex('Lateral raise', 3, '12–15', 'shoulders'), ex('Triceps pushdown', 3, '10–12', 'arms')] },
    { name: 'Pull', exercises: [ex('Pull-up', 4, '6–10', 'back'), ex('Barbell row', 4, '6–8', 'back'), ex('Face pull', 3, '12–15', 'shoulders'), ex('Dumbbell curl', 3, '10–12', 'arms'), ex('Hammer curl', 3, '10–12', 'arms')] },
    { name: 'Legs', exercises: [ex('Barbell back squat', 4, '5–8', 'legs'), ex('Romanian deadlift', 3, '8–10', 'legs'), ex('Leg press', 3, '10–12', 'legs'), ex('Leg curl', 3, '10–12', 'legs'), ex('Standing calf raise', 4, '12–15', 'legs')] },
  ] },
  upperlower: { label: 'Upper, lower', workouts: [
    { name: 'Upper', exercises: [ex('Bench press', 4, '6–8', 'chest'), ex('Barbell row', 4, '6–8', 'back'), ex('Overhead press', 3, '8–10', 'shoulders'), ex('Lat pulldown', 3, '10–12', 'back'), ex('Dumbbell curl', 3, '10–12', 'arms'), ex('Triceps pushdown', 3, '10–12', 'arms')] },
    { name: 'Lower', exercises: [ex('Barbell back squat', 4, '5–8', 'legs'), ex('Romanian deadlift', 3, '8–10', 'legs'), ex('Walking lunge', 3, '10', 'legs'), ex('Leg curl', 3, '10–12', 'legs'), ex('Plank', 3, '45s', 'core')] },
  ] },
  fullbody: { label: 'Full body', workouts: [
    { name: 'Full body A', exercises: [ex('Barbell back squat', 3, '5–8', 'legs'), ex('Bench press', 3, '6–8', 'chest'), ex('Barbell row', 3, '8–10', 'back'), ex('Plank', 3, '45s', 'core')] },
    { name: 'Full body B', exercises: [ex('Deadlift', 3, '5', 'legs'), ex('Overhead press', 3, '6–8', 'shoulders'), ex('Pull-up', 3, '6–10', 'back'), ex('Walking lunge', 3, '10', 'legs')] },
  ] },
};
const LIBRARY = exerciseLibrary();
// The routine editor's muscle group for a library exercise (the editor uses six broad groups).
const CAT_TO_GROUP = { chest: 'chest', back: 'back', shoulders: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', core: 'core' };
const MAPGROUP_TO_GROUP = { ...CAT_TO_GROUP, hips: 'legs', shins: 'legs' };
function routineGroup(lex) {
  if (CAT_TO_GROUP[lex.category]) return CAT_TO_GROUP[lex.category];
  const [main] = Object.entries(lex.muscles.primary).sort((a, b) => b[1] - a[1]);
  return (main && MAPGROUP_TO_GROUP[MUSCLE_INFO[main[0]].group]) || 'legs';
}
// Every name the routine editor suggests: the full library, your own exercises and the older list.
const routineNames = () => {
  const seen = new Set();
  return [...allExercises().map((e) => e.name), ...LIBRARY.map((e) => e.name)]
    .filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.localeCompare(b));
};
const GROUP_LABEL = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', core: 'Core' };

const usingCustom = () => state.routine && state.routine.mode === 'custom' && routineKeys(state.profile, state.routine, 0);

function syncRoutine() {
  setCustomRoutine(state.routine && state.routine.mode === 'custom' ? state.routine : null);
  state.exerciseNames = { ...(state.exerciseNames || {}), ...customExerciseNames() };
}

function applyTemplate(id) {
  state.routine.workouts = TEMPLATES[id].workouts.map((w) => ({ id: uid(), name: w.name, exercises: w.exercises.map((e) => ({ ...e, id: uid() })) }));
  state.routine.startWeek = currentWeek();
  if (state.profile.sessionsPerWeek < state.routine.workouts.length) state.profile.sessionsPerWeek = Math.min(6, state.routine.workouts.length);
  syncRoutine(); commit();
}

function renderRoutine() {
  const r = state.routine;
  const custom = r.mode === 'custom';
  const n = state.profile.sessionsPerWeek;
  const count = r.workouts.length;
  const cycleNote = !count ? '' : n === count
    ? `Each workout once a week.`
    : n % count === 0 ? `Your ${count} workouts run ${n / count} times a week.`
    : `Your ${count} workouts repeat in order, carrying on next week where you stop.`;

  app.innerHTML = `
  ${subnav('routine')}
  <div class="page-head">
    <div>
      <h1>Your routine</h1>
      <p class="page-sub">Already have a program? Enter it here. Slotted keeps your workouts and fits them around your week.</p>
    </div>
  </div>
  <div class="chips" role="radiogroup" aria-label="Which routine to follow" style="margin-bottom:20px">
    ${chip('rmode', 'custom', 'My own routine', custom)}
    ${chip('rmode', 'suggested', 'Slotted’s suggested plan', !custom, SPLIT_NAMES[n])}
  </div>
  ${custom ? `
  <section class="card stack" style="margin-bottom:16px">
    <h2>Start from a template</h2>
    <p class="muted small">Pick the closest one, then change anything to match what you do.</p>
    <div class="actions" id="templates">
      ${Object.entries(TEMPLATES).map(([id, t]) => `<button type="button" data-template="${id}">${esc(t.label)}</button>`).join('')}
    </div>
    <div id="tpl-confirm"></div>
  </section>
  <ol class="workouts">
    ${r.workouts.map((w, wi) => `
    <li class="card workout" data-w="${w.id}">
      <div class="whead">
        <span class="wnum" aria-hidden="true">${wi + 1}</span>
        <label class="sr" for="wn-${w.id}">Workout ${wi + 1} name</label>
        <input id="wn-${w.id}" class="wname" type="text" value="${esc(w.name)}" placeholder="Workout name" data-wfield="name">
        <div class="wtools">
          <button type="button" class="ghost" data-wmove="-1" aria-label="Move ${esc(w.name)} up" ${wi === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ghost" data-wmove="1" aria-label="Move ${esc(w.name)} down" ${wi === count - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="ghost danger" data-wdel aria-label="Delete ${esc(w.name)}">Delete</button>
        </div>
      </div>
      <div class="exgrid" role="table" aria-label="${esc(w.name)} exercises">
        <div class="exgrid-head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">Sets</span><span role="columnheader">Reps</span><span role="columnheader">Muscle</span><span></span></div>
        ${w.exercises.map((e) => `
        <div class="exline" role="row" data-e="${e.id}">
          <input type="text" list="exlib" value="${esc(e.name)}" placeholder="Exercise" data-efield="name" aria-label="Exercise name">
          <input type="number" inputmode="numeric" min="1" max="10" value="${esc(e.sets)}" data-efield="sets" aria-label="Sets">
          <input type="text" value="${esc(e.reps)}" placeholder="8–12" data-efield="reps" aria-label="Reps">
          <select data-efield="group" aria-label="Muscle group">${GROUPS.map((g) => `<option value="${g}" ${e.group === g ? 'selected' : ''}>${GROUP_LABEL[g]}</option>`).join('')}</select>
          <button type="button" class="ghost" data-edel aria-label="Remove ${esc(e.name || 'exercise')}">×</button>
        </div>`).join('')}
      </div>
      <button type="button" class="ghost addex" data-eadd>Add exercise</button>
    </li>`).join('')}
  </ol>
  <datalist id="exlib">${routineNames().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  <p class="muted small" style="margin-top:12px">Can’t find an exercise? <a href="#library">Browse the library</a> or create your own there.</p>
  <div class="actions"><button type="button" id="addw">Add workout</button></div>

  <section class="card stack" style="margin-top:20px">
    <h2>How you run it</h2>
    <fieldset style="margin:0">
      <legend class="small" style="font:500 17px var(--body)">Sessions a week</legend>
      <div class="chips">${[2, 3, 4, 5, 6].map((k) => chip('rper', k, String(k), n === k)).join('')}</div>
      <p class="hint" style="margin:10px 0 0">${esc(cycleNote)}</p>
    </fieldset>
    <label class="chip"><input type="checkbox" id="keeporder" ${r.keepOrder ? 'checked' : ''}><span>Keep my workouts in this order<small>Off lets Slotted shuffle them to dodge game days</small></span></label>
  </section>` : `
  <section class="card stack">
    <p>Slotted builds your sessions from your goal, experience and equipment in Settings. Switch to your own routine any time; your logged history stays.</p>
  </section>`}
  <div class="actions" style="margin-top:20px"><a class="btn primary big" href="#plan">See this week’s plan</a></div>`;

  app.querySelectorAll('input[name=rmode]').forEach((i) => i.addEventListener('change', () => {
    r.mode = i.value;
    if (r.mode === 'custom' && !r.startWeek) r.startWeek = currentWeek();
    syncRoutine(); commit(); renderRoutine();
  }));
  if (!custom) return;

  app.querySelectorAll('[data-template]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.template;
    if (!r.workouts.length) { applyTemplate(id); renderRoutine(); toast(`${TEMPLATES[id].label} loaded`); return; }
    document.getElementById('tpl-confirm').innerHTML = `<div class="confirm"><span>Replace your ${r.workouts.length} workouts with ${esc(TEMPLATES[id].label)}?</span><button type="button" class="danger" id="tpl-yes">Replace</button><button type="button" id="tpl-no">Keep mine</button></div>`;
    document.getElementById('tpl-yes').addEventListener('click', () => { applyTemplate(id); renderRoutine(); toast(`${TEMPLATES[id].label} loaded`); });
    document.getElementById('tpl-no').addEventListener('click', () => { document.getElementById('tpl-confirm').innerHTML = ''; });
  }));

  const findW = (el) => r.workouts.find((w) => w.id === el.closest('[data-w]').dataset.w);
  const save = () => { syncRoutine(); commit(); };

  app.querySelectorAll('[data-wfield]').forEach((i) => i.addEventListener('change', () => { findW(i).name = i.value; save(); }));
  app.querySelectorAll('[data-efield]').forEach((i) => i.addEventListener('change', () => {
    const w = findW(i);
    const e = w.exercises.find((x) => x.id === i.closest('[data-e]').dataset.e);
    const f = i.dataset.efield;
    e[f] = f === 'sets' ? Math.max(1, Math.min(10, Number(i.value) || 3)) : i.value;
    if (f === 'name') {
      const lex = findExercise(i.value.trim());
      const old = LIBRARY.find((l) => l.name.toLowerCase() === i.value.trim().toLowerCase());
      const group = lex ? routineGroup(lex) : old && old.group;
      if (group) { e.group = group; i.closest('[data-e]').querySelector('select').value = group; }
    }
    save();
  }));
  app.querySelectorAll('[data-edel]').forEach((b) => b.addEventListener('click', () => {
    const w = findW(b);
    w.exercises = w.exercises.filter((x) => x.id !== b.closest('[data-e]').dataset.e);
    save(); renderRoutine();
  }));
  app.querySelectorAll('[data-eadd]').forEach((b) => b.addEventListener('click', () => {
    const w = findW(b);
    const e = { id: uid(), name: '', sets: 3, reps: '8–12', group: 'chest' };
    w.exercises.push(e);
    save(); renderRoutine();
    const row = app.querySelector(`[data-e="${e.id}"] input`);
    if (row) row.focus();
  }));
  app.querySelectorAll('[data-wmove]').forEach((b) => b.addEventListener('click', () => {
    const i = r.workouts.indexOf(findW(b));
    const j = i + Number(b.dataset.wmove);
    [r.workouts[i], r.workouts[j]] = [r.workouts[j], r.workouts[i]];
    save(); renderRoutine();
  }));
  app.querySelectorAll('[data-wdel]').forEach((b) => b.addEventListener('click', () => {
    const w = findW(b);
    const slot = b.closest('.wtools');
    slot.innerHTML = `<span class="small">Delete ${esc(w.name || 'this workout')}?</span><button type="button" class="ghost danger" data-yes>Delete</button><button type="button" class="ghost" data-no>Keep</button>`;
    slot.querySelector('[data-yes]').addEventListener('click', () => { r.workouts = r.workouts.filter((x) => x !== w); save(); renderRoutine(); });
    slot.querySelector('[data-no]').addEventListener('click', renderRoutine);
  }));
  document.getElementById('addw').addEventListener('click', () => {
    const w = { id: uid(), name: `Workout ${r.workouts.length + 1}`, exercises: [{ id: uid(), name: '', sets: 3, reps: '8–12', group: 'chest' }] };
    r.workouts.push(w);
    if (!r.startWeek) r.startWeek = currentWeek();
    save(); renderRoutine();
    const name = document.getElementById(`wn-${w.id}`);
    if (name) { name.focus(); name.select(); }
  });
  app.querySelectorAll('input[name=rper]').forEach((i) => i.addEventListener('change', () => {
    state.profile.sessionsPerWeek = Number(i.value); save(); renderRoutine();
  }));
  document.getElementById('keeporder').addEventListener('change', (e) => { r.keepOrder = e.target.checked; save(); });
}

// ---------- exercise library ----------
// Browse every exercise, see what it works and how it's tracked, and add your own.
const lib = { q: '', group: '', role: '', equipment: '', mechanics: '', type: '', mine: true, shown: 60, sel: null };
const ROLE_NAMES = { primary: 'Main', secondary: 'Helper', stabilisers: 'Stabiliser' };
const ROLE_KEYS = { primary: 'primary', secondary: 'secondary', stabiliser: 'stabilisers' };
const defaultReps = (track) => ({ duration: '30–45s', weight_duration: '30–45s', distance_duration: '40m', weight_distance: '40m' }[track] || '8–12');
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;

function libResults() {
  return searchExercises(lib.q, {
    group: lib.group || undefined, role: lib.group && lib.role ? lib.role : undefined, equipment: lib.equipment || undefined,
    mechanics: lib.mechanics || undefined, type: lib.type || undefined,
    fits: lib.mine && state.profile.equipment !== 'gym' ? state.profile.equipment : undefined,
  });
}
const mainGroups = (e) => [...new Set(Object.keys(e.muscles.primary).map((id) => MUSCLE_GROUPS[MUSCLE_INFO[id].group]))].join(', ');

function libListHtml(results, selId) {
  if (!results.length) return '<p class="muted small" style="padding:12px">No exercises match. Try fewer filters or another name.</p>';
  return `${results.slice(0, lib.shown).map((e) => `<button type="button" class="exitem" data-lib="${esc(e.id)}" aria-current="${e.id === selId}">
      <span class="exname">${esc(e.name)}${e.custom ? ' <span class="badge done">Yours</span>' : ''}</span>
      <span class="exmeta">${esc(EQUIPMENT[e.equipment])}. ${esc(mainGroups(e))}</span>
    </button>`).join('')}
    ${results.length > lib.shown ? `<button type="button" class="ghost more-btn" id="lib-more">Show all ${results.length}</button>` : ''}`;
}

// Every logged session of a library exercise, whatever key it was stored under.
function libHistory(e) {
  const all = collectHistory(state.log, state.history);
  const moves = Object.keys(all).filter((m) => (exerciseForMove(m) || {}).id === e.id);
  return { moves, list: moves.flatMap((m) => all[m]).sort((a, b) => a.date - b.date) };
}

function libDetailHtml(e) {
  if (!e) return '<section class="card exdetail"><p class="muted">Pick an exercise to see its details.</p></section>';
  const chips = (role) => Object.entries(e.muscles[role] || {}).sort((a, b) => b[1] - a[1])
    .map(([id]) => `<span class="mchip">${esc(MUSCLE_INFO[id].label)}<b>${esc(MUSCLE_GROUPS[MUSCLE_INFO[id].group])}</b></span>`).join('');
  const roles = ['primary', 'secondary', 'stabilisers'].filter((r) => Object.keys(e.muscles[r] || {}).length);
  const alts = alternativesFor(e, { fits: state.profile.equipment, limit: 6 });
  const { moves, list } = libHistory(e);
  const track = trackOf(e);
  const own = usingCustom() ? state.routine.workouts : [];
  return `<section class="card exdetail stack" id="libdetail" tabindex="-1">
    <div>
      <h3 style="font-size:24px">${esc(e.name)}</h3>
      ${e.aka && e.aka.length ? `<p class="small muted" style="margin-top:6px">Also called ${esc(e.aka.slice(0, 4).join(', '))}</p>` : ''}
    </div>
    <div class="mchips">${exerciseTypes(e).map((t) => `<span class="badge">${esc(t)}</span>`).join('')}${e.custom ? '<span class="badge done">Your exercise</span>' : ''}</div>
    <dl class="dl-stats libstats">
      <div><dt>Equipment</dt><dd>${esc(EQUIPMENT[e.equipment])}</dd></div>
      <div><dt>Movement</dt><dd>${esc(e.pattern || CATEGORIES[e.category])}</dd></div>
      <div><dt>Tracked as</dt><dd>${esc(TRACKS[track].label)}</dd></div>
      ${hasWeight(track) ? `<div><dt>Weight</dt><dd>${esc(LOADS[e.load])}</dd></div>` : ''}
    </dl>
    <div class="libmuscles">
      ${roles.map((r) => `<div><span class="label">${ROLE_NAMES[r]} muscles</span><div class="mchips" style="margin-top:6px">${chips(r)}</div></div>`).join('')}
      <p class="rec-note">Main muscles count a full set toward recovery, helpers half, stabilisers a little.</p>
    </div>
    ${e.cue ? `<div><span class="label">How to do it</span><p style="margin-top:4px">${esc(e.cue)}</p></div>` : ''}
    ${alts.length ? `<div><span class="label">Alternatives with your equipment</span><div class="swaplist" style="margin-top:8px">${alts.map((o) => `<button type="button" data-lib="${esc(o.id)}">${esc(o.name)}<small>${esc(EQUIPMENT[o.equipment])}</small></button>`).join('')}</div></div>` : ''}
    <div>
      <span class="label">Your history</span>
      ${list.length ? `<ol class="hist-list" style="margin-top:6px">${list.slice().reverse().slice(0, 5).map((s2) => `<li style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;flex-wrap:wrap">
          <span class="muted small" style="min-width:110px">${esc(fmtDay(s2.date))}</span>
          <span style="flex:1;font-variant-numeric:tabular-nums">${esc(setsText(s2.sets, s2.track, units()))}</span>
          ${s2.pr ? '<span class="badge done">Personal best</span>' : ''}</li>`).join('')}</ol>
        <div class="actions"><button type="button" data-libprog="${esc(moves[0])}">See it on Progress</button></div>`
        : '<p class="small muted" style="margin-top:4px">You haven’t logged this one yet.</p>'}
    </div>
    ${own.length ? `<div class="libadd">
        <label class="label" for="lib-addw">Add to a workout</label>
        <div class="row" style="margin-top:6px">
          <div class="field"><select id="lib-addw">${own.map((w) => opt(w.id, w.name || 'Workout', '')).join('')}</select></div>
          <button type="button" class="primary" id="lib-add">Add ${esc(e.name)}</button>
        </div>
      </div>` : `<p class="small muted">Follow <a href="#routine">your own routine</a> to add exercises to your workouts.</p>`}
    ${e.custom ? `<div class="actions" id="lib-own"><a class="btn" href="#library/edit/${esc(e.id)}">Edit</a><button type="button" class="ghost danger" id="lib-del">Delete</button></div>` : ''}
  </section>`;
}

function renderLibrary() {
  if (routeArgs[0] === 'new' || routeArgs[0] === 'edit') { renderExerciseForm(routeArgs[0] === 'edit' ? exerciseById(routeArgs[1]) : null); return; }
  if (routeArgs[0]) { lib.sel = routeArgs[0]; routeArgs = []; }
  const results = libResults();
  const sel = exerciseById(lib.sel) || results[0] || null;
  if (sel) lib.sel = sel.id;
  const active = lib.q || lib.group || lib.equipment || lib.mechanics || lib.type;
  app.innerHTML = `
  ${subnav('library')}
  <div class="page-head">
    <div>
      <h1>Exercise library</h1>
      <p class="page-sub">${allExercises().length} exercises. Tap one to see the muscles it works, how to do it and your history with it.</p>
    </div>
    <a class="btn primary" href="#library/new">Create exercise</a>
  </div>
  <section class="card libfilters" aria-label="Search and filters">
    <div class="field">
      <label class="label" for="lib-q">Search</label>
      <input id="lib-q" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Name, muscle or equipment, like db row or glutes" value="${esc(lib.q)}">
    </div>
    <div class="libfilter-row">
      <div class="field"><label class="label" for="lib-group">Muscle group</label><select id="lib-group" data-libf="group">${opt('', 'Any', lib.group)}${Object.entries(MUSCLE_GROUPS).map(([k, v]) => opt(k, v, lib.group)).join('')}</select></div>
      <div class="field"><label class="label" for="lib-role">Worked as</label><select id="lib-role" data-libf="role" ${lib.group ? '' : 'disabled'}>${opt('', 'Main or helper', lib.role)}${opt('primary', 'Main muscle', lib.role)}${opt('secondary', 'Helper muscle', lib.role)}</select></div>
      <div class="field"><label class="label" for="lib-eq">Equipment</label><select id="lib-eq" data-libf="equipment">${opt('', 'Any', lib.equipment)}${Object.entries(EQUIPMENT).map(([k, v]) => opt(k, v, lib.equipment)).join('')}</select></div>
      <div class="field"><label class="label" for="lib-mech">Compound or isolation</label><select id="lib-mech" data-libf="mechanics">${opt('', 'Either', lib.mechanics)}${opt('compound', 'Compound', lib.mechanics)}${opt('isolation', 'Isolation', lib.mechanics)}</select></div>
      <div class="field"><label class="label" for="lib-type">Type</label><select id="lib-type" data-libf="type">${opt('', 'Any', lib.type)}${EXERCISE_TYPES.map((t) => opt(t, t, lib.type)).join('')}</select></div>
    </div>
    <div class="actions">
      ${state.profile.equipment !== 'gym' ? `<label class="chip"><input type="checkbox" id="lib-mine" ${lib.mine ? 'checked' : ''}><span>Only kit I have</span></label>` : ''}
      ${active ? '<button type="button" class="ghost" id="lib-clear">Clear filters</button>' : ''}
      <span class="small muted" id="lib-count" role="status">${plural(results.length, 'exercise')}</span>
    </div>
  </section>
  <div class="lifts" style="margin-top:14px">
    <nav class="card exlist" aria-label="Exercises" id="lib-list">${libListHtml(results, lib.sel)}</nav>
    ${libDetailHtml(sel)}
  </div>`;

  const redrawList = () => {
    const r = libResults();
    document.getElementById('lib-list').innerHTML = libListHtml(r, lib.sel);
    document.getElementById('lib-count').textContent = plural(r.length, 'exercise');
    wireLibList(document.getElementById('lib-list'));
  };
  const q = document.getElementById('lib-q');
  q.addEventListener('input', () => { lib.q = q.value; lib.shown = 60; redrawList(); });
  app.querySelectorAll('[data-libf]').forEach((sEl) => sEl.addEventListener('change', () => {
    lib[sEl.dataset.libf] = sEl.value;
    if (sEl.dataset.libf === 'group' && !sEl.value) lib.role = '';
    lib.shown = 60;
    renderLibrary();
  }));
  const mine = document.getElementById('lib-mine');
  if (mine) mine.addEventListener('change', () => { lib.mine = mine.checked; renderLibrary(); });
  const clear = document.getElementById('lib-clear');
  if (clear) clear.addEventListener('click', () => { Object.assign(lib, { q: '', group: '', role: '', equipment: '', mechanics: '', type: '', shown: 60 }); renderLibrary(); });
  wireLibList();
  wireLibDetail(sel);
}

function wireLibList(root = app) {
  const more = document.getElementById('lib-more');
  if (more) more.addEventListener('click', () => { lib.shown = Infinity; renderLibrary(); });
  root.querySelectorAll('[data-lib]').forEach((b) => b.addEventListener('click', () => {
    lib.sel = b.dataset.lib;
    const keep = window.scrollY;
    renderLibrary();
    if (window.matchMedia('(max-width: 860px)').matches) document.getElementById('libdetail').scrollIntoView({ block: 'start' });
    else window.scrollTo(0, keep);
  }));
}

function wireLibDetail(e) {
  if (!e) return;
  const prog = app.querySelector('[data-libprog]');
  if (prog) prog.addEventListener('click', () => { selectedMove = prog.dataset.libprog; location.hash = '#progress'; });
  const add = document.getElementById('lib-add');
  if (add) add.addEventListener('click', () => {
    const w = state.routine.workouts.find((x) => x.id === document.getElementById('lib-addw').value);
    if (!w) return;
    w.exercises.push({ id: uid(), name: e.name, sets: 3, reps: defaultReps(trackOf(e)), group: routineGroup(e) });
    syncRoutine(); commit();
    toast(`${e.name} added to ${w.name || 'your workout'}`);
  });
  const del = document.getElementById('lib-del');
  if (del) del.addEventListener('click', () => {
    const box = document.getElementById('lib-own');
    box.innerHTML = `<div class="confirm"><span>Delete ${esc(e.name)}? Sets you’ve logged with it stay in your history.</span><button type="button" class="danger" id="lib-del-yes">Delete</button><button type="button" id="lib-del-no">Keep it</button></div>`;
    document.getElementById('lib-del-yes').addEventListener('click', () => {
      // Kept as a marker so a synced device doesn't bring it back.
      state.customExercises = (state.customExercises || []).map((x) => (x.id === e.id ? { ...x, deleted: true } : x));
      loadLibrary(); commit();
      lib.sel = null;
      renderLibrary();
      toast(`${e.name} deleted`);
    });
    document.getElementById('lib-del-no').addEventListener('click', renderLibrary);
  });
}

// ---------- create or edit your own exercise ----------
function renderExerciseForm(editing) {
  if (editing && !editing.custom) editing = null;
  const base = editing || { name: '', equipment: 'dumbbell', category: 'chest', mechanics: 'isolation', track: 'weight_reps', load: 'total', muscles: { primary: {}, secondary: {}, stabilisers: {} }, cue: '' };
  const roleOfId = (id) => (base.muscles.primary[id] ? 'primary' : base.muscles.secondary[id] ? 'secondary' : base.muscles.stabilisers[id] ? 'stabilisers' : '');
  const byGroup = Object.keys(MUSCLE_GROUPS).map((g) => [g, Object.entries(MUSCLE_INFO).filter(([, m]) => m.group === g)]);
  app.innerHTML = `
  ${subnav('library')}
  <div class="page-head"><div>
    <h1>${editing ? `Edit ${esc(editing.name)}` : 'Create an exercise'}</h1>
    <p class="page-sub">Add something the library doesn’t have. It works everywhere: workouts, swaps, recovery and progress.</p>
  </div></div>
  <form id="exform" class="card stack exform" novalidate>
    <div class="field">
      <label class="label" for="xf-name">Name</label>
      <input id="xf-name" type="text" autocomplete="off" maxlength="60" value="${esc(base.name)}" placeholder="For example, Landmine press" required>
      <div id="xf-dupe" role="status"></div>
    </div>
    <p class="small" id="xf-map" role="status"></p>
    <div class="row">
      <div class="field"><label class="label" for="xf-eq">Equipment</label><select id="xf-eq">${Object.entries(EQUIPMENT).map(([k, v]) => opt(k, v, base.equipment)).join('')}</select></div>
      <div class="field"><label class="label" for="xf-cat">Category</label><select id="xf-cat">${Object.entries(CATEGORIES).map(([k, v]) => opt(k, v, base.category)).join('')}</select></div>
      <div class="field"><label class="label" for="xf-mech">Compound or isolation</label><select id="xf-mech">${opt('compound', 'Compound (several joints)', base.mechanics)}${opt('isolation', 'Isolation (one joint)', base.mechanics)}</select></div>
    </div>
    <div class="row">
      <div class="field"><label class="label" for="xf-track">How you log it</label><select id="xf-track">${Object.entries(TRACKS).map(([k, v]) => opt(k, v.label, base.track)).join('')}</select></div>
      <div class="field"><label class="label" for="xf-load">What the weight means</label><select id="xf-load">${Object.entries(LOADS).map(([k, v]) => opt(k, v, base.load)).join('')}</select></div>
    </div>
    <fieldset class="xf-muscles">
      <legend class="label">Muscles</legend>
      <p class="hint" style="margin:0 0 10px">Main muscles do most of the work. Helpers assist, stabilisers hold you steady. These drive the recovery map, so check them.</p>
      <div class="mgrid">
        ${byGroup.map(([g, ms]) => `<div class="mgroup"><b>${esc(MUSCLE_GROUPS[g])}</b>${ms.map(([id, m]) => `
          <label class="xf-mrow"><span>${esc(m.label)}</span><select data-muscle="${id}" aria-label="${esc(m.label)}">${opt('', '—', roleOfId(id))}${opt('primary', 'Main', roleOfId(id))}${opt('secondary', 'Helper', roleOfId(id))}${opt('stabilisers', 'Stabiliser', roleOfId(id))}</select></label>`).join('')}</div>`).join('')}
      </div>
    </fieldset>
    <div class="field"><label class="label" for="xf-cue">How to do it (optional)</label><textarea id="xf-cue" rows="2" maxlength="300">${esc(base.cue || '')}</textarea></div>
    <p class="errors" id="xf-err" role="alert"></p>
    <div class="actions"><button type="submit" class="primary">${editing ? 'Save changes' : 'Save exercise'}</button><a class="btn ghost" href="#library">Cancel</a></div>
  </form>`;

  const $ = (id) => document.getElementById(id);
  let touched = !!editing; // once the user picks muscles by hand, suggestions stop overwriting them
  let pattern = editing ? editing.pattern : 'Custom';
  const syncLoad = () => {
    const weighted = TRACKS[$('xf-track').value].fields.includes('kg');
    if (!weighted) $('xf-load').value = 'none';
    else if ($('xf-load').value === 'none') $('xf-load').value = 'total';
    $('xf-load').disabled = !weighted;
  };
  syncLoad();
  $('xf-track').addEventListener('change', syncLoad);
  app.querySelectorAll('[data-muscle]').forEach((sEl) => sEl.addEventListener('change', () => { touched = true; }));
  ['xf-eq', 'xf-cat', 'xf-mech', 'xf-track', 'xf-load'].forEach((id) => $(id).addEventListener('change', () => { touched = true; }));

  const onName = () => {
    const name = $('xf-name').value.trim();
    const same = similarExercises(name).filter((x) => !editing || x.id !== editing.id);
    $('xf-dupe').innerHTML = same.length ? `<p class="small note-warn">Already in the library: ${same.map((x) => `<a href="#library/${esc(x.id)}">${esc(x.name)}</a>`).join(', ')}. Use ${same.length > 1 ? 'one of those' : 'that'} instead if it’s the same exercise.</p>` : '';
    if (touched) return;
    const from = name.length >= 3 ? suggestMapping(name) : null;
    if (!from) { $('xf-map').textContent = ''; return; }
    $('xf-eq').value = from.equipment; $('xf-cat').value = from.category; $('xf-mech').value = from.mechanics;
    $('xf-track').value = from.track; $('xf-load').value = from.load; syncLoad();
    pattern = from.pattern;
    app.querySelectorAll('[data-muscle]').forEach((sEl) => {
      const id = sEl.dataset.muscle;
      sEl.value = from.muscles.primary[id] ? 'primary' : from.muscles.secondary[id] ? 'secondary' : from.muscles.stabilisers[id] ? 'stabilisers' : '';
    });
    $('xf-map').innerHTML = `Filled in from <b>${esc(from.name)}</b>. Check the muscles and details, and change anything that’s different.`;
  };
  $('xf-name').addEventListener('input', onName);
  if (editing) onName();

  $('exform').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('xf-name').value.trim().replace(/\s+/g, ' ');
    const muscles = { primary: {}, secondary: {}, stabilisers: {} };
    app.querySelectorAll('[data-muscle]').forEach((sEl) => {
      if (sEl.value) muscles[sEl.value][sEl.dataset.muscle] = ROLE_WEIGHT[sEl.value === 'stabilisers' ? 'stabiliser' : sEl.value];
    });
    const renamed = editing && editing.name !== name;
    const rec = {
      id: editing ? editing.id : `u_${uid()}`, name,
      aka: [...new Set([...((editing && editing.aka) || []), ...(renamed ? [editing.name] : [])])].filter((n) => n.toLowerCase() !== name.toLowerCase()),
      equipment: $('xf-eq').value, category: $('xf-cat').value, pattern: pattern || 'Custom', mechanics: $('xf-mech').value,
      track: $('xf-track').value, load: $('xf-load').value, muscles, cue: $('xf-cue').value.trim(), createdAt: (editing && editing.createdAt) || Date.now(),
    };
    const errs = validateExercise(rec);
    const clash = findExercise(name);
    if (clash && clash.id !== rec.id) errs.unshift(`${clash.name} is already in the library under that name.`);
    if (errs.length) { $('xf-err').textContent = errs.join(' '); return; }
    state.customExercises = [...(state.customExercises || []).filter((x) => x.id !== rec.id), rec];
    state.exerciseNames = { ...(state.exerciseNames || {}), [exerciseKey(name)]: name };
    rememberExerciseNames(state.exerciseNames);
    loadLibrary(); commit();
    lib.sel = rec.id;
    Object.assign(lib, { q: '', group: '', role: '', equipment: '', mechanics: '', type: '' });
    location.hash = '#library';
    toast(editing ? 'Exercise saved' : `${name} added to the library`);
  });
}

// ---------- coach ----------
const GOAL_LABEL = { muscle: 'build muscle', strength: 'get stronger', sport: 'perform better at sport', fitness: 'general fitness' };
const LEVEL_LABEL = { beginner: 'under a year of lifting', intermediate: '1 to 3 years of lifting', advanced: 'more than 3 years of lifting' };
const EQUIP_LABEL = { gym: 'a full gym', home: 'a home gym (dumbbells, bench, pull-up bar)', bodyweight: 'no equipment' };

// A compact summary of the athlete for the coach. Only what they've told the app, and never Strava data.
function coachContext() {
  const ctx = weekCtx();
  const { key, entry, tIdx } = ctx;
  const p = state.profile;
  const data = trainingData();
  const lines = [];
  lines.push(`Today: ${DAYS[tIdx]} ${fmtDate(today())}.`);
  lines.push(`Goal: ${GOAL_LABEL[p.goal] || p.goal}. Experience: ${LEVEL_LABEL[p.level] || p.level}. Trains with ${EQUIP_LABEL[p.equipment] || p.equipment}. Weekly target: ${p.sessionsPerWeek} gym sessions, ${p.sessionLength} minutes each. Prefers to train ${{ morning: 'in the morning', evening: 'in the evening' }[p.timeOfDay] || 'after school'}.`);
  lines.push(usingCustom()
    ? `Follows their own routine: ${state.routine.workouts.map((w) => `${w.name} (${w.exercises.map((e) => e.name).filter(Boolean).join(', ')})`).join('; ')}.`
    : `Follows Slotted's suggested plan: ${SPLIT_NAMES[p.sessionsPerWeek]}.`);
  if ((state.restDays || []).length) lines.push(`Preferred rest days: ${state.restDays.map((d) => DAYS[d]).join(', ')}.`);
  const sport = blocksFor(key).filter((b) => b.type === 'sport');
  if (sport.length) lines.push(`Sport this week: ${sport.map((b) => `${DAYS_SHORT[b.day]} ${b.label} (${b.intensity === 'hard' ? 'game, full effort' : b.intensity === 'easy' ? 'easy session, minimal effort' : 'training, moderate effort'})`).join(', ')}.`);
  const other = blocksFor(key).filter((b) => b.type === 'work' || b.type === 'other');
  if (other.length) lines.push(`Other commitments: ${other.map((b) => `${DAYS_SHORT[b.day]} ${b.label} ${fmtTime(toMin(b.start))} to ${fmtTime(toMin(b.end))}${b.flex ? ' (flexible)' : ''}${b.once ? ' (this week only)' : ''}`).join(', ')}.`);
  const school = blocksFor(key).filter((b) => b.type === 'school');
  if (school.length) lines.push(`School: ${school.map((b) => `${DAYS_SHORT[b.day]} ${fmtTime(toMin(b.start))} to ${fmtTime(toMin(b.end))}${b.once ? ' (this week only)' : ''}`).join(', ')}.`);
  if (entry.busy) lines.push('They marked this a busy week.');
  lines.push(`Sessions done this week: ${ctx.counted} of ${ctx.target}${ctx.credit ? ' (one counted from sport)' : ''}.`);
  lines.push('This week\'s sessions:');
  for (const s of entry.plan) {
    const status = `${ctx.isDone(s) ? 'done' : ctx.isPast(s) ? 'not done' : s.day === tIdx ? 'today' : 'upcoming'}${s.locked ? ', locked by the athlete' : ''}${lightFor(s) ? ', made lighter' : ''}`;
    lines.push(`- ${DAYS_SHORT[s.day]} ${fmtTime(s.start)} ${s.name} (${status}): ${shownExercises(s, ctx.isShort(s)).map((x) => `${x.name} ${x.sets}x${x.reps}`).join(', ')}`);
  }
  if (!entry.plan.length) lines.push('- none planned');
  const skipped = (entry.skipDays || []).map((d) => DAYS_SHORT[d]);
  if (skipped.length) lines.push(`Days they said they can't train this week: ${skipped.join(', ')}.`);
  const c = entry.checkins && entry.checkins[tIdx];
  const r = readiness(c);
  if (r) lines.push(`Today's check-in: sleep ${QUESTIONS[0].options[c.sleep]}, soreness ${QUESTIONS[1].options[c.sore]}, energy ${QUESTIONS[2].options[c.energy]}${extrasText(c) ? `, ${extrasText(c)}` : ''}. Result: ${r.title}.`);
  const yc = entry.checkins && tIdx > 0 && entry.checkins[tIdx - 1];
  if (!r && readiness(yc)) lines.push(`Yesterday's check-in result: ${readiness(yc).title}${readiness(yc).reasons.length ? ` (${readiness(yc).reasons.join(', ')})` : ''}.`);
  const said = entry.reports && entry.reports[tIdx];
  if (said) lines.push(`What they told the app today: ${[said.sore && said.sore.length ? `${said.sore.join(', ')} sore` : '', said.tired ? 'very tired' : '', said.fresh && said.fresh.length ? `${said.fresh.join(', ')} feel recovered` : ''].filter(Boolean).join('; ')}.`);
  // The app's own suggestions (from logged training and check-ins only; never Strava). The coach can explain them; the athlete accepts them on This week.
  const sugg = weekProposals(ctx, { withStrava: false }).proposals;
  if (sugg.length) lines.push(`Suggested changes the app is showing on This week (waiting for the athlete to accept or decline): ${sugg.map((p) => `${p.title}. ${p.reason}`).join(' | ')}`);
  const streak = streakInfo(state.history, key, targetFor, templateSport);
  const cons = consistency(data, key, 8, { targetFor, sportCreditFor: templateSport });
  lines.push(`Weekly streak: ${streak.current} weeks (longest ${streak.longest}).${cons.weeksJudged ? ` Weekly target hit in ${cons.weeksMet} of the last ${cons.weeksJudged} finished weeks.` : ''}`);
  const fr = freshnessNow({ withStrava: false });
  if (fr.hasData) {
    const worked = fr.muscles.filter((m) => m.fresh < 85).sort((a, b) => a.fresh - b.fresh);
    // Groups with their individual muscles, so quads and hamstrings (for example) are told apart.
    const partsOf = (g) => fr.detail.filter((p) => p.group === g.id && p.fresh < 85).sort((a, b) => a.fresh - b.fresh).map((p) => `${p.label} ${p.fresh}%`);
    lines.push(`Muscle freshness, an estimate from logged gym sets in the last 7 days (weight, reps, effort taps and recent volume), not a medical measurement: ${worked.length ? `${worked.map((m) => `${m.label} ${m.fresh}% recovered${partsOf(m).length > 1 ? ` (${partsOf(m).join(', ')})` : ''}`).join('; ')}; everything else fresh` : 'all muscles fresh'}.`);
  }
  const prs = recentPRs(data, nameOfMove, 5);
  if (prs.length) lines.push(`Recent personal bests: ${prs.map((x) => `${x.name} ${prText(x)} (${fmtDate(x.date)})`).join('; ')}.`);
  const all = collectHistory(state.log, state.history);
  const moves = Object.keys(all).sort((a, b) => all[b][all[b].length - 1].date - all[a][all[a].length - 1].date).slice(0, 10);
  if (moves.length) {
    lines.push(`Recent exercises (newest last). Weights are in ${units() === 'lb' ? 'pounds (lb)' : 'kilograms (kg)'}; times are in seconds (45 s) or minutes:seconds (1:05); distances in metres:`);
    for (const m of moves) {
      const lex = exerciseForMove(m);
      const track = all[m][0].track;
      const how = [TRACKS[track].label.toLowerCase(), hasWeight(track) && lex && lex.load !== 'none' ? `weight is ${LOADS[lex.load].toLowerCase()}` : ''].filter(Boolean).join(', ');
      const effortOf = (s2) => { const e = ((((state.log || {})[s2.wk] || {})[s2.sk] || {})[m] || []).find((x) => x && x.done && EFFORT[x.effort]); return e ? ` (${EFFORT[e.effort].label.toLowerCase()})` : ''; };
      const recent = all[m].slice(-4).map((s2) => `${fmtDate(s2.date)}: ${setsText(s2.sets, track, units())}${effortOf(s2)}`).join('; ');
      lines.push(`- ${nameOfMove(m)} (${how}): ${recent}`);
    }
  } else {
    lines.push('No lifts logged yet.');
  }
  return `About the athlete:\n${lines.join('\n')}`;
}

const COACH_ERRORS = {
  not_set_up: 'The coach isn’t switched on for this site yet. The site owner needs to add an API key.',
  rate_limited: 'You’ve asked a lot of questions today. Try again tomorrow.',
  not_granted: 'Allow this page to use Claude to chat with the coach.',
  sampling_disabled: 'The coach isn’t available on this account.',
  session_expired: 'Sign in again to keep chatting.',
  offline: 'You’re offline. The coach needs an internet connection.',
  refused: 'The coach can’t help with that one. Try asking about your training.',
  busy: 'The coach is busy right now. Try again in a minute.',
};
let coachCtl = null;

// What the coach can see, shown beside the chat so it's clear where answers come from.
function coachSide() {
  const ctx = weekCtx();
  const fr = freshnessNow({ withStrava: false });
  const worked = fr.hasData ? fr.muscles.filter((m) => m.fresh < 85).sort((a, b) => a.fresh - b.fresh).slice(0, 3) : [];
  const pr = recentPRs(trainingData(), nameOfMove, 1)[0];
  const c = ctx.todays ? readiness(checkinFor(ctx.todays)) : null;
  return `<aside class="card coach-side" aria-labelledby="cs-h">
    <h3 id="cs-h">What the coach can see</h3>
    <ul>
      <li><b>${ctx.todays ? esc(ctx.todays.name) : 'Rest day'}</b><span>Today${ctx.todays ? `, ${fmtTime(ctx.todays.start)}${ctx.isDone(ctx.todays) ? ', done' : ''}` : ''}</span></li>
      <li><b>${ctx.counted} of ${plural(ctx.target, 'session')}</b><span>This week</span></li>
      <li><b>${worked.length ? worked.map((m) => `${m.label} ${m.fresh}%`).join(', ') : fr.hasData ? 'All recovered' : 'No recent sets'}</b><span>Muscle recovery</span></li>
      ${c ? `<li><b>${esc(c.title)}</b><span>Today’s check-in</span></li>` : ''}
      ${pr ? `<li><b>${esc(pr.name)} ${esc(prText(pr))}</b><span>Latest personal best</span></li>` : ''}
    </ul>
    <p class="small muted">The coach suggests changes. Your plan only changes when you change it.</p>
  </aside>`;
}

function renderCoach() {
  state.coach = state.coach || { turns: [] };
  const turns = state.coach.turns;
  app.innerHTML = `
  <div class="page-head">
    <div>
      <h1>Coach</h1>
      <p class="page-sub">Ask anything about your training. The coach knows your plan, your week, your recovery and your recent lifts.</p>
    </div>
    ${turns.length ? '<button type="button" class="ghost" id="coach-clear">Clear chat</button>' : ''}
  </div>
  <div class="coach-layout">
    <section class="card chat" aria-label="Chat with the coach">
      <div class="chatlog" id="chatlog" aria-live="polite">
        ${turns.length ? turns.map((t) => `<div class="msg ${t.role}">${t.role === 'user' ? `<p>${esc(t.content)}</p>` : formatReply(t.content)}</div>`).join('') : `
          <div class="coach-empty">
            <b>Having a rough week, or stuck on something?</b>
            <p class="muted small">Pick a question or ask your own.</p>
          </div>`}
      </div>
      ${turns.length ? '' : `<div class="starters">${STARTERS.map((q) => `<button type="button" data-starter="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
      <form id="coachform" class="composer">
        <label class="sr" for="coach-q">Your question</label>
        <textarea id="coach-q" rows="2" maxlength="1500" placeholder="My squat has been stuck at 60 kg for three weeks"></textarea>
        <button type="submit" class="primary" id="coach-send">Ask</button>
      </form>
      <p class="errors" id="coach-err" role="alert"></p>
      <p class="muted small">General training advice, not medical advice. For pain or injury, see a physio or GP.</p>
    </section>
    <div class="stack" style="margin-top:0">${coachSide()}${availHtml()}</div>
  </div>`;

  const log = document.getElementById('chatlog');
  log.scrollTop = log.scrollHeight;
  const form = document.getElementById('coachform');
  const box = document.getElementById('coach-q');
  const err = document.getElementById('coach-err');
  box.addEventListener('input', () => { err.textContent = ''; });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const ask = async (question) => {
    const q = question.trim();
    if (!q) { err.textContent = 'Type a question first.'; box.focus(); return; }
    if (coachCtl) return;
    turns.push({ role: 'user', content: q });
    state.coach.turns = turns.slice(-20);
    commit();
    renderCoach();
    const logEl = document.getElementById('chatlog');
    const bubble = document.createElement('div');
    bubble.className = 'msg assistant thinking';
    bubble.innerHTML = '<p>Thinking…</p>';
    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    const btn = document.getElementById('coach-send');
    btn.textContent = 'Stop';
    btn.type = 'button';
    coachCtl = new AbortController();
    btn.onclick = () => coachCtl && coachCtl.abort();
    try {
      const text = await askCoach(state.coach.turns, coachContext(), {
        signal: coachCtl.signal,
        onText: ({ text: t }) => { bubble.classList.remove('thinking'); bubble.innerHTML = formatReply(t); logEl.scrollTop = logEl.scrollHeight; },
      });
      state.coach.turns.push({ role: 'assistant', content: text });
      commit();
      coachCtl = null;
      if (viewName() === 'coach') renderCoach();
    } catch (e) {
      coachCtl = null;
      bubble.remove();
      if (viewName() !== 'coach') return;
      const code = e && e.code;
      // Put the question back so it can be sent again.
      state.coach.turns.pop(); commit(); renderCoach();
      document.getElementById('coach-q').value = q;
      if (code !== 'cancelled') document.getElementById('coach-err').textContent = COACH_ERRORS[code] || 'Couldn’t reach the coach. Try again.';
    }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); if (!coachCtl) ask(box.value); });
  wireAvail(renderCoach);
  app.querySelectorAll('[data-starter]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.starter)));
  const clear = document.getElementById('coach-clear');
  if (clear) clear.addEventListener('click', () => { state.coach.turns = []; commit(); renderCoach(); });
  if (pendingCoachQ && !coachCtl) { const q = pendingCoachQ; pendingCoachQ = null; ask(q); }
}

// ---------- settings ----------
// ---------- account and sync ----------
// Signed in: every change saves to this device straight away, then uploads a moment later.
let account = { status: 'checking' };
let syncStatus = '';
let pushTimer = null;
let pushing = false;
let lastPull = 0;

function adoptState(next, syncedAt) {
  state = { ...defaultState(), ...next, installDismissed: state.installDismissed, syncedAt };
  save(state);
  loadLibrary();
  rememberExerciseNames(state.exerciseNames);
  syncRoutine();
}

async function loadAccount() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('unavailable');
    const me = await res.json();
    account = me.signedIn ? { status: 'signedIn', ...me } : { status: me.available ? 'signedOut' : 'unavailable' };
  } catch {
    account = { status: 'unavailable' };
  }
  if (account.status === 'signedIn') await pull();
  refreshAccountViews();
}

async function pull() {
  lastPull = Date.now();
  let res;
  try { res = await fetch('/api/sync', { credentials: 'same-origin' }); } catch { return; }
  if (res.status === 401) { account = { status: 'signedOut' }; return; }
  if (!res.ok) return;
  const { data, updatedAt } = await res.json();
  if (!data) { if (state.setupDone) pushNow(); return; }
  const neverSynced = !state.syncedAt;
  const localChanged = (state.updatedAt || 0) > (state.syncedAt || 0);
  if (neverSynced || updatedAt > state.syncedAt) {
    const fresh = neverSynced && !state.setupDone;
    adoptState(fresh || !localChanged ? data : mergeStates(state, data), updatedAt);
    if (!fresh && localChanged) pushNow();
    route();
  } else if (localChanged) {
    pushNow();
  }
}

function schedulePush() {
  if (account.status !== 'signedIn') return;
  syncStatus = 'saving';
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
}

async function pushNow(retry = true) {
  if (account.status !== 'signedIn') return;
  if (pushing) { schedulePush(); return; }
  pushing = true;
  try {
    const res = await fetch('/api/sync', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: forUpload(state), baseUpdatedAt: state.syncedAt || 0 }),
    });
    if (res.ok) {
      state.syncedAt = (await res.json()).updatedAt;
      save(state);
      syncStatus = 'saved';
    } else if (res.status === 409 && retry) {
      const theirs = await res.json();
      adoptState(mergeStates(state, theirs.data), theirs.updatedAt);
      pushing = false;
      await pushNow(false);
      route();
      return;
    } else if (res.status === 401) {
      account = { status: 'signedOut' };
      syncStatus = '';
    } else {
      syncStatus = 'error';
    }
  } catch {
    syncStatus = 'offline';
  } finally {
    pushing = false;
    refreshAccountViews();
  }
}

function refreshAccountViews() {
  if (!state.setupDone) return;
  const view = viewName();
  if (view === 'profile') renderSettings();
  else if (view === 'plan') renderPlan();
  else if (view === 'home' || view === '') renderHome();
  renderSideWeek();
}

window.addEventListener('online', () => { if (syncStatus === 'offline') schedulePush(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && account.status === 'signedIn' && Date.now() - lastPull > 60000) pull();
});

// Messages after coming back from Google or Strava.
function showReturnMessage() {
  const q = new URLSearchParams(location.search);
  const msgs = {
    signin: { ok: 'Signed in. Your training now syncs across your devices.', cancelled: 'Sign-in cancelled.', failed: 'Sign-in didn’t work. Try again.' },
    strava: {
      connected: 'Strava connected. Your activities now show on your week.', cancelled: 'Strava connection cancelled.',
      noscope: 'Strava needs permission to see your activities. Try connecting again and leave activity access ticked.',
      signin: 'Sign in first, then connect Strava.', failed: 'Strava didn’t connect. Try again.',
    },
  };
  for (const [k, table] of Object.entries(msgs)) {
    const v = q.get(k);
    if (v && table[v]) setTimeout(() => toast(table[v]), 300);
  }
  if (q.has('signin') || q.has('strava')) history.replaceState(null, '', location.pathname + location.hash);
}

// ---------- Strava ----------
// Activities are fetched for this week only, kept in memory, and never sent to the AI coach.
let strava = { week: null, items: [], at: 0, loading: false };
const stravaOn = () => account.status === 'signedIn' && account.strava && account.strava.connected;
const dateOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function stravaFor(key) {
  if (!stravaOn()) return [];
  if (strava.week !== key || Date.now() - strava.at > 10 * 60 * 1000) loadStrava(key);
  return strava.week === key ? strava.items : [];
}

async function loadStrava(key) {
  if (strava.loading) return;
  strava.loading = true;
  try {
    const after = Math.floor(keyToDate(key).getTime() / 1000) - 86400;
    const res = await fetch(`/api/strava/activities?after=${after}`, { credentials: 'same-origin' });
    if (res.ok) {
      const { activities } = await res.json();
      strava = {
        week: key, at: Date.now(), loading: false,
        items: activities.filter((a) => a.date && weekKey(dateOf(a.date)) === key)
          .map((a) => ({ ...a, day: (dateOf(a.date).getDay() + 6) % 7 })),
      };
      if (state.setupDone && ['plan', 'home'].includes(viewName())) route();
    } else if (res.status === 401 || res.status === 404) {
      if (account.strava) account.strava.connected = false;
      strava = { week: key, items: [], at: Date.now(), loading: false };
    }
  } catch { /* offline: show the week without Strava */ } finally {
    strava.loading = false;
  }
}

function accountPanel() {
  if (account.status === 'checking') return `<section class="card stack"><h2>Account</h2><p class="muted small">Checking sign-in…</p></section>`;
  if (account.status === 'unavailable') {
    return `<section class="card stack"><h2>Account</h2>
      <p class="muted small">Sign-in isn’t switched on for this site yet, so your training is saved on this device only.</p></section>`;
  }
  if (account.status === 'signedOut') {
    return `<section class="card stack"><h2>Account</h2>
      <p class="small">Sign in to back up your training and use it on any device. Everything on this device comes with you.</p>
      <div class="actions"><a class="btn primary" href="/api/auth/google/start">Sign in with Google</a></div>
      <p class="muted small"><a href="privacy.html">How your data is used</a></p></section>`;
  }
  const status = { saving: 'Saving…', saved: 'All changes saved', offline: 'Offline. Changes will save when you’re back online.', error: 'Couldn’t save. Will try again.' }[syncStatus] || 'Synced';
  const sv = account.strava || {};
  return `<section class="card stack"><h2>Account</h2>
      <p class="small">Signed in as <b>${esc(account.user.name || account.user.email)}</b>${account.user.name && account.user.email ? ` <span class="muted">${esc(account.user.email)}</span>` : ''}</p>
      <p class="muted small sync-${syncStatus || 'ok'}">${status}</p>
      <div class="actions" id="acct-actions">
        <button type="button" id="signout">Sign out</button>
        <button type="button" class="ghost danger" id="delete-acct">Delete account</button>
      </div>
      <p class="muted small"><a href="privacy.html">How your data is used</a></p>
    </section>
    ${sv.available ? `<section class="card stack"><h2>Strava</h2>
      ${sv.connected
        ? `<p class="small">Connected as <b>${esc(sv.athlete || 'you')}</b>. This week’s activities show on your week and count toward your streak.</p>
           <div class="actions"><button type="button" id="strava-off">Disconnect Strava</button></div>`
        : `<p class="small">Show your runs, rides and games from Strava on your week, and count them toward your streak.</p>
           <div class="actions"><a class="btn strava-btn" href="/api/strava/start">Connect with Strava</a></div>`}
      <p class="muted small">Strava activities are only shown to you and are never sent to the AI coach.</p>
    </section>` : ''}`;
}

function wireAccountPanel() {
  const post = (path) => fetch(path, { method: 'POST', credentials: 'same-origin' });
  const out = document.getElementById('signout');
  if (out) out.addEventListener('click', async () => {
    await post('/api/auth/logout').catch(() => {});
    account = { status: 'signedOut' };
    toast('Signed out. Your data stays on this device.');
    renderSettings();
  });
  const del = document.getElementById('delete-acct');
  if (del) del.addEventListener('click', () => {
    const box = document.getElementById('acct-actions');
    box.innerHTML = `<div class="confirm"><span>Delete your account and everything saved online? Your data on this device stays.</span>
      <button type="button" class="danger" id="del-yes">Delete account</button><button type="button" id="del-no">Keep it</button></div>`;
    document.getElementById('del-no').addEventListener('click', renderSettings);
    document.getElementById('del-yes').addEventListener('click', async () => {
      const res = await post('/api/account/delete').catch(() => null);
      if (res && res.ok) {
        account = { status: 'signedOut' };
        delete state.syncedAt; save(state);
        toast('Account deleted. Your data on this device is still here.');
      } else toast('Couldn’t delete your account. Try again.');
      renderSettings();
    });
  });
  const off = document.getElementById('strava-off');
  if (off) off.addEventListener('click', async () => {
    const res = await post('/api/strava/disconnect').catch(() => null);
    if (res && res.ok) {
      account.strava.connected = false;
      strava = { week: null, items: [], at: 0, loading: false };
      toast('Strava disconnected');
    } else toast('Couldn’t disconnect Strava. Try again.');
    renderSettings();
  });
}

function renderSettings() {
  const theme = state.theme || 'dark';
  app.innerHTML = `
  <div class="page-head"><div><h1>Settings</h1><p class="page-sub">Changes to your training update your plan straight away.</p></div></div>
  <div class="settings-grid">
    <form id="prof" class="card settings-form">
      ${profileFields()}
      <div class="actions" style="margin-top:22px"><button class="primary" type="submit">Save changes</button></div>
    </form>
    <div class="stack" style="margin-top:0">
      <section class="card stack">
        <h2>Appearance</h2>
        <div class="seg" role="group" aria-label="Theme">
          ${[['dark', 'Dark'], ['light', 'Light'], ['system', 'Match device']].map(([v, t]) => `<button type="button" data-theme="${v}" aria-pressed="${theme === v}">${t}</button>`).join('')}
        </div>
        <h3 style="margin-top:6px">Weights</h3>
        <div class="seg" role="group" aria-label="Weight units">
          ${[['kg', 'Kilograms (kg)'], ['lb', 'Pounds (lb)']].map(([v, t]) => `<button type="button" data-units="${v}" aria-pressed="${units() === v}">${t}</button>`).join('')}
        </div>
        <p class="muted small">Changes how weights show and how you type them. Your history stays the same.</p>
      </section>
      ${accountPanel()}
      <section class="card stack">
        <h2>Your routine</h2>
        <p class="muted small">${usingCustom()
          ? `Following your own routine: ${state.routine.workouts.map((w) => esc(w.name)).join(', ')}.`
          : 'Following Slotted’s suggested plan. Already have a program? Use it instead.'}</p>
        <div class="actions"><a class="btn" href="#routine">${usingCustom() ? 'Edit routine' : 'Use my own routine'}</a></div>
      </section>
      <section class="card stack">
        <h2>Your data</h2>
        <p class="muted small">${account.status === 'signedIn' ? 'Backed up to your account. You can also keep a copy as a file.' : 'Saved on this device. Download a backup now and then so clearing your browser doesn’t wipe your history.'}</p>
        <div class="actions">
          <button type="button" id="export">Download backup</button>
          <label class="btn" style="cursor:pointer">Restore backup<input id="import" type="file" accept="application/json,.json" hidden></label>
        </div>
        <div class="actions"><button type="button" class="ghost danger" id="reset">Delete everything on this device</button></div>
      </section>
    </div>
  </div>`;

  wireAccountPanel();
  app.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    state.theme = b.dataset.theme;
    applyTheme(); commit(); renderSettings();
  }));
  app.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => {
    state.units = b.dataset.units;
    commit(); renderSettings(); toast(`Weights now in ${state.units === 'lb' ? 'pounds' : 'kilograms'}`);
  }));
  const form = document.getElementById('prof');
  wireAB(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const hadAB = state.useAB;
    readProfile(form);
    if (state.useAB && !hadAB && !state.blocks.B.length) state.blocks.B = state.blocks.A.map((b) => ({ ...b, id: uid() }));
    commit(); renderSideWeek(); toast('Changes saved');
  });

  document.getElementById('export').addEventListener('click', async () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    // Inside a Claude preview, downloads go through the viewer's save prompt.
    const saver = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (saver) {
      try { await saver.save({ filename: `slotted-backup-${currentWeek()}.json`, data: blob }); toast('Backup saved'); } catch (er) { if (er && er.code !== 'declined') toast('Couldn’t save the backup here.'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `slotted-backup-${currentWeek()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.getElementById('import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state = importJSON(await file.text());
      loadLibrary(); rememberExerciseNames(state.exerciseNames); syncRoutine();
      applyTheme(); commit(); toast('Backup restored'); route();
    } catch (er) {
      toast(er.message || 'That file couldn’t be read.');
    }
  });
  document.getElementById('reset').addEventListener('click', (e) => {
    const box = e.target.parentElement;
    box.innerHTML = `<div class="confirm"><span>This can’t be undone.</span><button type="button" class="danger" id="reset-yes">Yes, delete everything</button><button type="button" id="reset-no">Keep my data</button></div>`;
    document.getElementById('reset-yes').addEventListener('click', () => { reset(); state = load(); loadLibrary(); applyTheme(); location.hash = '#setup'; route(); });
    document.getElementById('reset-no').addEventListener('click', renderSettings);
  });
}

window.addEventListener('resize', () => {
  if (viewName() === 'progress') { clearTimeout(drawChart.t); drawChart.t = setTimeout(drawChart, 120); }
});

if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

loadLibrary();
applyTheme();
showReturnMessage();
loadAccount();
if (state.setupDone) askToKeepData();
rememberExerciseNames(state.exerciseNames);
syncRoutine();
// Close an open options menu when tapping anywhere else.
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; });
});

route();
