// Training statistics for the Home dashboard and Progress page.
// Everything here is read from what was recorded: sessions marked done, ticked sets, and the saved weekly plans.
// Nothing is estimated except where a function says so.
import { addWeeks, keyToDate } from './scheduler.js';
import { collectHistory, summarise } from './progress.js';
import { musclesFor, partsFor, MUSCLES } from './freshness.js';
import { exerciseForMove, volumeOf, trackOf, secOf, roleOf } from './exercises.js';

const ticked = (list) => (list || []).filter((s) => s && s.done);
const kgOf = (s) => Number(s.kg) || 0;
const repsOf = (s) => Number(s.reps) || 0;
const unique = (arr) => [...new Set(arr || [])];
// Sessions later today still count as today's work (sets can be ticked before the planned start time).
const endOfDay = (d) => new Date(d).setHours(23, 59, 59, 999);

// When a planned session took place: Monday of its week plus its day, at its start time.
export function sessionDate(wk, s) {
  const d = keyToDate(wk);
  d.setDate(d.getDate() + (s ? s.day : 0));
  if (s && s.start != null) d.setHours(0, s.start, 0, 0);
  return d;
}

// ---------- one week ----------
export function weekStats({ history = {}, log = {} }, key, { targetFor = () => 0, sportCreditFor = () => 0 } = {}) {
  const e = history[key] || {};
  const done = unique(e.done).length;
  let sets = 0;
  let volume = 0;
  let weightedSets = 0;
  for (const moves of Object.values(log[key] || {})) {
    for (const [move, list] of Object.entries(moves || {})) {
      const ex = exerciseForMove(move);
      for (const s of ticked(list)) {
        sets++;
        const v = volumeOf(s, ex);
        if (v) { weightedSets++; volume += v; }
      }
    }
  }
  const target = targetFor(key);
  return {
    key, done, planned: (e.plan || []).length, target, sets, weightedSets,
    volume: Math.round(volume), met: target > 0 && done + Math.min(1, sportCreditFor(key)) >= target,
    tracked: !!history[key],
  };
}

// Week keys from the first recorded week (or `count` weeks back) up to `currentKey`, oldest first.
export function weekRange({ history = {}, log = {} }, currentKey, count = 'all') {
  let first = [...Object.keys(history), ...Object.keys(log)].filter((k) => k <= currentKey).sort()[0] || currentKey;
  if (count !== 'all') {
    const from = addWeeks(currentKey, -(count - 1));
    if (from > first) first = from;
  }
  const out = [];
  for (let k = first; k <= currentKey; k = addWeeks(k, 1)) out.push(k);
  return out;
}

// ---------- consistency ----------
// Hit rate counts finished weeks the person used the app, plus this week once it's already met.
export function consistency(data, currentKey, count, opts) {
  const weeks = weekRange(data, currentKey, count).map((k) => weekStats(data, k, opts));
  const judged = weeks.filter((w) => w.tracked && (w.key < currentKey || w.met));
  return {
    weeks,
    weeksJudged: judged.length,
    weeksMet: judged.filter((w) => w.met).length,
    completed: weeks.reduce((t, w) => t + w.done, 0),
  };
}

// Planned sessions whose time has passed without being marked done.
export function missedSessions({ history = {} }, keys, currentKey, todayIdx, nowMin) {
  let missed = 0;
  for (const k of keys) {
    const e = history[k];
    if (!e || !e.plan) continue;
    const done = new Set(e.done || []);
    for (const s of e.plan) {
      if (done.has(s.key)) continue;
      const over = k < currentKey || s.day < todayIdx || (s.day === todayIdx && s.end <= nowMin);
      if (over) missed++;
    }
  }
  return missed;
}

// Sessions marked done in the last `days` days.
export function sessionsSince({ history = {} }, now, days) {
  const from = now.getTime() - days * 864e5;
  let n = 0;
  for (const [wk, e] of Object.entries(history)) {
    for (const k of unique(e.done)) {
      const s = (e.plan || []).find((p) => p.key === k);
      const t = sessionDate(wk, s).getTime();
      if (t >= from && t <= now.getTime()) n++;
    }
  }
  return n;
}

// ---------- workout history ----------
// Every session marked done, newest first, with the sets that were ticked in it.
export function completedWorkouts({ history = {}, log = {} }, nameOf = (m) => m, sessionName = (k) => k) {
  const out = [];
  for (const [wk, e] of Object.entries(history)) {
    for (const key of unique(e.done)) {
      const s = (e.plan || []).find((p) => p.key === key);
      const moves = (log[wk] || {})[key] || {};
      const exercises = Object.entries(moves)
        .map(([move, list]) => {
          const ex = exerciseForMove(move);
          const track = trackOf(ex);
          const timed = track === 'duration' || track === 'weight_duration';
          return { move, name: nameOf(move), track, volume: ticked(list).reduce((v, y) => v + volumeOf(y, ex), 0),
            sets: ticked(list).map((x) => ({ kg: kgOf(x), reps: timed ? 0 : repsOf(x), sec: secOf(x, track), m: Number(x.m) || 0 })) };
        })
        .filter((x) => x.sets.length);
      const sets = exercises.reduce((t, x) => t + x.sets.length, 0);
      const volume = Math.round(exercises.reduce((t, x) => t + x.volume, 0));
      const times = (e.times || {})[key];
      out.push({
        wk, key, name: (s && s.name) || sessionName(key), date: sessionDate(wk, s), exercises, sets, volume,
        minutes: times && times.start && times.end ? Math.max(1, Math.round((times.end - times.start) / 60000)) : null,
      });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

// ---------- personal records ----------
export function personalRecords(data, nameOf = (m) => m) {
  const all = collectHistory(data.log, data.history);
  return Object.entries(all).map(([move, list]) => {
    const sum = summarise(list);
    const best = list.find((s) => s.best === sum.best) || list[list.length - 1];
    return { move, name: nameOf(move), best: sum.best, e1rm: sum.bestE1rm, date: best.date, sessions: list.length, weighted: sum.weighted, kind: sum.kind };
  }).sort((a, b) => b.date - a.date || a.name.localeCompare(b.name));
}

export function recentPRs(data, nameOf = (m) => m, limit = 5) {
  const all = collectHistory(data.log, data.history);
  const out = [];
  for (const [move, list] of Object.entries(all)) {
    for (const s of list) if (s.pr) out.push({ move, name: nameOf(move), date: s.date, kg: s.best.kg, reps: s.best.reps, sec: s.best.sec, m: s.best.m, kind: s.kind });
  }
  return out.sort((a, b) => b.date - a.date).slice(0, limit);
}

// ---------- muscles ----------
// Ticked sets per muscle in a time window. Secondary muscles count as part sets, as in the freshness model.
export function muscleSets({ history = {}, log = {} }, from, to, exercise = () => ({})) {
  const out = Object.fromEntries(MUSCLES.map((m) => [m.id, 0]));
  for (const [wk, sessions] of Object.entries(log)) {
    const plan = (history[wk] && history[wk].plan) || [];
    for (const [sk, moves] of Object.entries(sessions || {})) {
      const t = sessionDate(wk, plan.find((p) => p.key === sk)).getTime();
      if (t < from || t > to) continue;
      for (const [move, list] of Object.entries(moves || {})) {
        const n = ticked(list).length;
        if (!n) continue;
        const info = exercise(move) || {};
        for (const [id, w] of Object.entries(musclesFor(move, info.name, info.group))) if (id in out) out[id] += n * w;
      }
    }
  }
  for (const id of Object.keys(out)) out[id] = Math.round(out[id] * 10) / 10;
  return out;
}

// Recent logged work that hit one muscle (as a main or secondary mover), newest first.
export function muscleWork({ history = {}, log = {} }, muscle, now, days = 7, exercise = () => ({})) {
  const from = now.getTime() - days * 864e5;
  const out = [];
  for (const [wk, sessions] of Object.entries(log)) {
    const plan = (history[wk] && history[wk].plan) || [];
    for (const [sk, moves] of Object.entries(sessions || {})) {
      const s = plan.find((p) => p.key === sk);
      const date = sessionDate(wk, s);
      if (date.getTime() < from || date.getTime() > endOfDay(now)) continue;
      for (const [move, list] of Object.entries(moves || {})) {
        const sets = ticked(list);
        if (!sets.length) continue;
        const info = exercise(move) || {};
        const w = musclesFor(move, info.name, info.group)[muscle] || 0;
        if (w >= 0.5) out.push({ date, session: s ? s.name : '', name: info.name || move, sets: sets.length, main: w >= 1 });
      }
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

// Hours until a muscle reaches `threshold`% using the same freshness model, looking up to a week ahead.
// `freshAt(date)` returns that muscle's freshness at a given time. Returns 0 if already there, null if not within the week.
export function hoursUntilFresh(freshAt, now, threshold = 85, stepHours = 3, maxHours = 168) {
  for (let h = 0; h <= maxHours; h += stepHours) {
    if (freshAt(new Date(now.getTime() + h * 36e5)) >= threshold) return h;
  }
  return null;
}

// ---------- detailed muscles ----------
// Logged work that hit one detailed muscle (for example vastus lateralis), newest first, with its role.
export function partWork({ history = {}, log = {} }, part, now, days = 14, exercise = () => ({})) {
  const from = now.getTime() - days * 864e5;
  const out = [];
  for (const [wk, sessions] of Object.entries(log)) {
    const plan = (history[wk] && history[wk].plan) || [];
    for (const [sk, moves] of Object.entries(sessions || {})) {
      const s = plan.find((p) => p.key === sk);
      const date = sessionDate(wk, s);
      if (date.getTime() < from || date.getTime() > endOfDay(now)) continue;
      for (const [move, list] of Object.entries(moves || {})) {
        const sets = ticked(list);
        if (!sets.length) continue;
        const info = exercise(move) || {};
        const w = partsFor(move, info.name, info.group)[part] || 0;
        if (!w) continue;
        const ex = exerciseForMove(move, info.name);
        const role = ex ? roleOf(ex, part) : w >= 1 ? 'primary' : w >= 0.5 ? 'secondary' : 'stabiliser';
        out.push({ date, session: s ? s.name : '', name: info.name || (ex && ex.name) || move, sets: sets.length, role, weight: w });
      }
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

// Weighted sets for one detailed muscle between two times (a helper set counts half, as in recovery).
export function partVolume(data, part, from, to, exercise = () => ({})) {
  const days = Math.ceil((to - from) / 864e5) + 1;
  return Math.round(partWork(data, part, new Date(to), days, exercise)
    .filter((w) => w.date.getTime() >= from)
    .reduce((t, w) => t + w.sets * w.weight, 0) * 10) / 10;
}
