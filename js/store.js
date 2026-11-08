// Saves everything on the device. No account, no server.
const KEY = 'slotted:v1';

export const defaultState = () => ({
  version: 1,
  setupDone: false,
  profile: { goal: 'muscle', level: 'beginner', equipment: 'gym', sessionsPerWeek: 3, sessionLength: 60, timeOfDay: 'afternoon' },
  window: { start: '06:00', end: '21:00' },
  useAB: false,
  abAnchor: null, // { week: 'YYYY-MM-DD', type: 'A' | 'B' }
  blocks: { A: [], B: [] },
  history: {}, // { [weekKey]: { done: [sessionKey], plan, busy, skipDays, shortKeys } }
  routine: { mode: 'suggested', workouts: [], keepOrder: true, startWeek: null },
  exerciseNames: {},
  coach: { turns: [] },
  theme: 'dark', // 'dark' | 'light' | 'system'
  name: '',
  restDays: [], // weekday indexes (0 = Monday) never to plan gym sessions on
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'slotted', exported: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== 'slotted' || !data.profile) throw new Error('That file isn’t a Slotted backup.');
  delete data.app;
  delete data.exported;
  return { ...defaultState(), ...data };
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
