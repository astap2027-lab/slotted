// Daily check-in: three quick answers decide how hard today's session should be.
// Four more are optional (sleep hours, tiredness, stress, how ready you feel) and only nudge the result.
export const QUESTIONS = [
  { id: 'sleep', label: 'Sleep', options: ['Good', 'OK', 'Bad'] },
  { id: 'sore', label: 'Soreness', options: ['Fresh', 'A bit sore', 'Very sore'] },
  { id: 'energy', label: 'Energy', options: ['High', 'Normal', 'Low'] },
];

export const EXTRAS = [
  { id: 'hours', label: 'Hours slept', options: ['Under 6', '6 to 7', '7 to 8', 'Over 8'], worst: 0, reason: 'under 6 hours of sleep' },
  { id: 'tired', label: 'Tiredness', options: ['Not tired', 'A bit', 'Very'], worst: 2, reason: 'very tired' },
  { id: 'stress', label: 'Stress', options: ['Low', 'Some', 'High'], worst: 2, reason: 'high stress' },
  { id: 'ready', label: 'Feel ready?', options: ['Ready', 'Not sure', 'Not really'], worst: 2, reason: 'not feeling ready' },
];
const answered = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

export const complete = (c) => !!c && QUESTIONS.every((q) => c[q.id] === 0 || c[q.id] === 1 || c[q.id] === 2);

// Each answer scores 0 (good) to 2 (bad). Very sore or two bad answers means a rough day.
export function readiness(c) {
  if (!complete(c)) return null;
  // Each optional answer at its worst adds half a point; leaving them out changes nothing.
  const extraBad = EXTRAS.filter((q) => answered(c[q.id], q.options.length) && c[q.id] === q.worst);
  const score = QUESTIONS.reduce((t, q) => t + c[q.id], 0) + extraBad.length * 0.5;
  const bad = QUESTIONS.filter((q) => c[q.id] === 2).length;
  const reasons = [
    ...QUESTIONS.filter((q) => c[q.id] === 2).map((q) => ({ sleep: 'bad sleep', sore: 'very sore', energy: 'low energy' }[q.id])),
    ...extraBad.map((q) => q.reason),
  ];
  const level = score >= 4 || bad >= 2 || c.sore === 2 ? 'rough' : score >= 2 ? 'easy' : 'good';
  const copy = {
    good: { title: 'Good to go', text: 'Train as planned. If the first sets feel easy, it’s a good day to push.' },
    easy: { title: 'Take it a bit easier', text: 'One set less on each exercise today. Same weights, focus on clean reps.' },
    rough: { title: 'Rough day', text: 'A light session still counts, or take the day off and Slotted moves this workout.' },
  }[level];
  return { score, level, reasons, ...copy };
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

// The optional answers written out, for the coach.
export function extrasText(c) {
  if (!c) return '';
  return EXTRAS.filter((q) => answered(c[q.id], q.options.length)).map((q) => `${q.label.toLowerCase()} ${q.options[c[q.id]].toLowerCase()}`).join(', ');
}
