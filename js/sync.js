// Syncing between devices. The server keeps one copy per account; when two devices both changed
// things, the copies are merged so no logged set or completed session is lost.

// Fields that belong to this device only and never sync.
const LOCAL_ONLY = ['installDismissed', 'syncedAt'];

export function forUpload(state) {
  const copy = { ...state };
  for (const k of LOCAL_ONLY) delete copy[k];
  return copy;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const union = (a = [], b = []) => [...new Set([...a, ...b])];

function mergeSets(newer = [], older = []) {
  const out = [];
  for (let i = 0; i < Math.max(newer.length, older.length); i++) {
    const n = newer[i];
    const o = older[i];
    out[i] = n && n.done ? n : o && o.done ? o : n || o || null;
  }
  return out;
}

// Settings come from whichever copy changed most recently; logs, finished sessions and
// check-ins from both copies are kept.
// opts.prefer: 'server' or 'local' picks whose settings win regardless of timestamps (a device's first sync
// takes the account's; a device asked to keep its own takes the device's).
export function mergeStates(local, server, opts = {}) {
  if (!server) return clone(local);
  if (!local) return clone(server);
  const localNewer = opts.prefer === 'local' ? true : opts.prefer === 'server' ? false : (local.updatedAt || 0) >= (server.updatedAt || 0);
  const newer = localNewer ? local : server;
  const older = localNewer ? server : local;
  const out = clone(newer);

  out.history = clone(newer.history || {});
  for (const [wk, o] of Object.entries(older.history || {})) {
    const n = out.history[wk];
    if (!n) { out.history[wk] = clone(o); continue; }
    n.done = union(n.done, o.done);
    n.skipDays = union(n.skipDays, o.skipDays);
    n.checkins = { ...(o.checkins || {}), ...(n.checkins || {}) };
    // Stage 3: what they said about how they feel, and suggestions they turned down, come from both.
    if (o.reports || n.reports) n.reports = { ...(o.reports || {}), ...(n.reports || {}) };
    if (o.dismissed || n.dismissed) n.dismissed = union(n.dismissed, o.dismissed);
    if (!n.plan && o.plan) n.plan = clone(o.plan);
    // Commitments read from a connected calendar: the newer copy wins; keep the other's if the newer has none.
    if (!n.cal && o.cal) n.cal = clone(o.cal);
    // Next-week sessions the athlete moved: keep the other copy's if the newer has none.
    if (!n.pins && o.pins) n.pins = clone(o.pins);
  }

  out.log = clone(newer.log || {});
  for (const [wk, sessions] of Object.entries(older.log || {})) {
    out.log[wk] = out.log[wk] || {};
    for (const [sk, moves] of Object.entries(sessions)) {
      out.log[wk][sk] = out.log[wk][sk] || {};
      for (const [move, sets] of Object.entries(moves)) {
        out.log[wk][sk][move] = mergeSets(out.log[wk][sk][move], sets);
      }
    }
  }

  out.exerciseNames = { ...(older.exerciseNames || {}), ...(newer.exerciseNames || {}) };
  // The user's own exercises: keep every one either device has; the newer copy of each wins.
  const mine = new Map((older.customExercises || []).map((e) => [e.id, e]));
  for (const e of newer.customExercises || []) mine.set(e.id, e);
  out.customExercises = [...mine.values()].map(clone);
  out.updatedAt = Math.max(local.updatedAt || 0, server.updatedAt || 0);
  return out;
}

// Whether a copy holds a set-up week: its own routine, commitments, or connected calendars.
export const hasSetup = (st) => !!st && (
  !!(st.routine && st.routine.mode === 'custom' && (st.routine.workouts || []).some((w) => (w.exercises || []).some((e) => e && e.name)))
  || Object.values(st.blocks || {}).some((l) => (l || []).length > 0)
  || (st.calendars || []).length > 0);

// The parts of a copy that a sync could replace: routine, commitments and calendars.
export const setupSig = (st) => JSON.stringify([st && st.routine, st && st.blocks, st && st.calendars, st && st.calendarRules]);

/**
 * What to do when this device hears from the account. Pure: the app carries it out.
 * @param local   this device's state (with syncedAt, updatedAt, setupDone)
 * @param server  the account's copy, or null when the account has none yet
 * @param serverUpdatedAt  when the account's copy was saved
 * @returns { action: 'none' | 'push' | 'adopt' | 'merge' | 'ask', state?, push?, first? }
 *   ask: the account's copy has no routine, commitments or calendars but this device does. Never decided silently.
 */
export function syncDecision(local, server, serverUpdatedAt = 0) {
  if (!server) return { action: local.setupDone ? 'push' : 'none' };
  const neverSynced = !local.syncedAt;
  const localChanged = (local.updatedAt || 0) > (local.syncedAt || 0);
  const serverNewer = neverSynced || serverUpdatedAt > local.syncedAt;
  if (!serverNewer) return { action: localChanged ? 'push' : 'none' };
  if (hasSetup(local) && !hasSetup(server)) return { action: 'ask' };
  // A brand-new device takes the account's copy as it is.
  if (neverSynced && !local.setupDone) return { action: 'adopt', state: clone(server) };
  // A device that was set up before signing in: the account's settings win; workouts logged here are kept.
  if (neverSynced) return { action: 'merge', state: mergeStates(local, server, { prefer: 'server' }), push: true, first: true };
  if (!localChanged) return { action: 'adopt', state: clone(server) };
  return { action: 'merge', state: mergeStates(local, server), push: true };
}
