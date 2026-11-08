// Turns the set log into per-exercise history: best sets, estimated 1-rep max, personal bests.
// Each exercise is measured the way it's tracked: weight and reps, reps, time or distance.
import { keyToDate } from './scheduler.js';
import { exerciseForMove, trackOf, secOf } from './exercises.js';

// Epley formula. Only meaningful for weighted sets with a sensible rep count.
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 && reps <= 15 ? Math.round(kg * (1 + reps / 30) * 2) / 2 : null);

// What progress means for each tracking type: the number that should go up.
// kind: 'kg' (heavier), 'reps' (more reps), 'sec' (longer), 'm' (further).
export function kindOf(track, sets) {
  if (track === 'duration') return 'sec';
  if (track === 'weight_duration') return sets.some((s) => s.kg > 0) ? 'kg' : 'sec';
  if (track === 'distance_duration') return 'm';
  if (track === 'weight_distance') return sets.some((s) => s.kg > 0) ? 'kg' : 'm';
  return sets.some((s) => s.kg > 0) ? 'kg' : 'reps';
}
// Best set for a kind: heaviest (then most reps, longest or furthest), most reps, longest, furthest.
const better = (kind) => (a, b) => {
  if (kind === 'kg') return b.kg > a.kg || (b.kg === a.kg && (b.reps > a.reps || b.sec > a.sec || b.m > a.m));
  if (kind === 'sec') return b.sec > a.sec;
  if (kind === 'm') return b.m > a.m || (b.m === a.m && b.kg > a.kg);
  return b.reps > a.reps;
};

export function collectHistory(log = {}, history = {}) {
  const byMove = {};
  for (const [wk, sessions] of Object.entries(log)) {
    const plan = (history[wk] && history[wk].plan) || [];
    for (const [sk, moves] of Object.entries(sessions)) {
      const planned = plan.find((s) => s.key === sk);
      const date = keyToDate(wk);
      date.setDate(date.getDate() + (planned ? planned.day : 0));
      for (const [move, raw] of Object.entries(moves)) {
        const track = trackOf(exerciseForMove(move));
        const sets = (raw || []).filter((x) => x && x.done).map((x) => ({
          kg: Number(x.kg) || 0,
          reps: track === 'duration' || track === 'weight_duration' ? 0 : Number(x.reps) || 0,
          sec: secOf(x, track),
          m: Number(x.m) || 0,
        }));
        if (!sets.length) continue;
        (byMove[move] = byMove[move] || []).push({ wk, sk, date, sets, track });
      }
    }
  }
  for (const move of Object.keys(byMove)) {
    const list = byMove[move].sort((a, b) => a.date - b.date);
    // One kind per exercise so every session in its history is compared like with like.
    const kind = kindOf(list[0].track, list.flatMap((s) => s.sets));
    let bestSoFar = 0;
    for (const s of list) {
      s.kind = kind;
      s.best = s.sets.reduce((a, b) => (better(kind)(a, b) ? b : a));
      s.e1rm = kind === 'kg' && (s.track === 'weight_reps' || s.track === 'reps') ? Math.max(0, ...s.sets.map((x) => e1rm(x.kg, x.reps) || 0)) || null : null;
      s.maxReps = Math.max(...s.sets.map((x) => x.reps));
      s.maxSec = Math.max(...s.sets.map((x) => x.sec));
      s.maxM = Math.max(...s.sets.map((x) => x.m));
      s.metric = kind === 'kg' ? s.best.kg : kind === 'sec' ? s.maxSec : kind === 'm' ? s.maxM : s.maxReps;
      s.volume = s.sets.reduce((t, x) => t + x.kg * x.reps, 0);
      s.pr = s.metric > 0 && s.metric > bestSoFar && bestSoFar > 0;
      bestSoFar = Math.max(bestSoFar, s.metric);
    }
  }
  return byMove;
}

// Summary for one exercise's list of sessions (oldest first).
export function summarise(list) {
  const first = list[0];
  const last = list[list.length - 1];
  const kind = first.kind || 'reps';
  const top = list.reduce((a, b) => (better(kind)(a.best, b.best) ? b : a));
  return {
    kind,
    weighted: kind === 'kg',
    best: top.best,
    bestE1rm: kind === 'kg' ? Math.max(0, ...list.map((s) => s.e1rm || 0)) || null : null,
    sessions: list.length,
    prs: list.filter((s) => s.pr).length,
    change: Math.round((last.metric - first.metric) * 10) / 10,
    since: first.date,
    lastDate: last.date,
  };
}
