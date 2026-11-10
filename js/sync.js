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
export function mergeStates(local, server) {
  if (!server) return clone(local);
  if (!local) return clone(server);
  const localNewer = (local.updatedAt || 0) >= (server.updatedAt || 0);
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
