// Turns the set log into per-exercise history: best sets, estimated 1-rep max, personal bests.
import { keyToDate } from './scheduler.js';

// Epley formula. Only meaningful for weighted sets with a sensible rep count.
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 && reps <= 15 ? Math.round(kg * (1 + reps / 30) * 2) / 2 : null);

export function collectHistory(log = {}, history = {}) {
  const byMove = {};
  for (const [wk, sessions] of Object.entries(log)) {
    const plan = (history[wk] && history[wk].plan) || [];
    for (const [sk, moves] of Object.entries(sessions)) {
      const planned = plan.find((s) => s.key === sk);
      const date = keyToDate(wk);
      date.setDate(date.getDate() + (planned ? planned.day : 0));
      for (const [move, raw] of Object.entries(moves)) {
        const sets = (raw || []).filter((x) => x && x.done)
          .map((x) => ({ kg: Number(x.kg) || 0, reps: Number(x.reps) || 0 }));
        if (!sets.length) continue;
        const heaviest = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
        const est = Math.max(0, ...sets.map((s) => e1rm(s.kg, s.reps) || 0)) || null;
        (byMove[move] = byMove[move] || []).push({
          wk, sk, date, sets, best: heaviest, e1rm: est,
          maxReps: Math.max(...sets.map((s) => s.reps)),
          volume: sets.reduce((t, s) => t + s.kg * s.reps, 0),
        });
      }
    }
  }
  for (const move of Object.keys(byMove)) {
    const list = byMove[move].sort((a, b) => a.date - b.date);
    let bestSoFar = 0;
    for (const s of list) {
      s.pr = s.best.kg > 0 && s.best.kg > bestSoFar && bestSoFar > 0;
      bestSoFar = Math.max(bestSoFar, s.best.kg);
    }
  }
  return byMove;
}

// Summary for one exercise's list of sessions (oldest first).
export function summarise(list) {
  const first = list[0];
  const last = list[list.length - 1];
  const weighted = list.some((s) => s.best.kg > 0);
  const best = list.reduce((a, b) => (b.best.kg > a.best.kg || (b.best.kg === a.best.kg && b.best.reps > a.best.reps) ? b : a)).best;
  const change = weighted ? last.best.kg - first.best.kg : last.maxReps - first.maxReps;
  return {
    weighted,
    best,
    bestE1rm: weighted ? Math.max(0, ...list.map((s) => s.e1rm || 0)) || null : null,
    sessions: list.length,
    prs: list.filter((s) => s.pr).length,
    change,
    since: first.date,
    lastDate: last.date,
  };
}
