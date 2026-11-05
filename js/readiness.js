// Daily check-in: three quick answers decide how hard today's session should be.
export const QUESTIONS = [
  { id: 'sleep', label: 'Sleep', options: ['Good', 'OK', 'Bad'] },
  { id: 'sore', label: 'Soreness', options: ['Fresh', 'A bit sore', 'Very sore'] },
  { id: 'energy', label: 'Energy', options: ['High', 'Normal', 'Low'] },
];

export const complete = (c) => !!c && QUESTIONS.every((q) => c[q.id] === 0 || c[q.id] === 1 || c[q.id] === 2);

// Each answer scores 0 (good) to 2 (bad). Very sore or two bad answers means a rough day.
export function readiness(c) {
  if (!complete(c)) return null;
  const score = QUESTIONS.reduce((t, q) => t + c[q.id], 0);
  const bad = QUESTIONS.filter((q) => c[q.id] === 2).length;
  const level = score >= 4 || bad >= 2 || c.sore === 2 ? 'rough' : score >= 2 ? 'easy' : 'good';
  const copy = {
    good: { title: 'Good to go', text: 'Train as planned. If the first sets feel easy, it’s a good day to push.' },
    easy: { title: 'Take it a bit easier', text: 'One set less on each exercise today. Same weights, focus on clean reps.' },
    rough: { title: 'Rough day', text: 'A light session still counts, or take the day off and Slotted moves this workout.' },
  }[level];
  return { score, level, ...copy };
}

// How today's session changes. Rough days need a choice: a light session, or rest (handled by re-planning).
export function adjustment(c) {
  const r = readiness(c);
  if (!r || r.level === 'good') return null;
  if (r.level === 'easy') return { setsMinus: 1, maxExercises: null, kgFactor: 1, note: 'Feeling flat: one set less on each exercise' };
  if (c.choice === 'light') return { setsMinus: 1, maxExercises: 3, kgFactor: 0.9, note: 'Light session: 3 exercises, one set less, about 10% lighter' };
  return null;
}

// Apply an adjustment to a session's exercise list.
export function applyAdjustment(exercises, adj) {
  if (!adj) return exercises;
  const list = adj.maxExercises ? exercises.slice(0, adj.maxExercises) : exercises;
  return list.map((x) => ({ ...x, sets: Math.max(2, x.sets - adj.setsMinus) }));
}
