// Fatigue-aware suggestions for the rest of the week: move a session, swap two sessions, make one
// lighter, or rest. App logic decides; nothing changes until the user accepts. Locked sessions and
// commitments are never touched. Freshness numbers are estimates from recorded training.
import { DAYS, fmtTime } from './scheduler.js';

export const TIRED = 70; // a session's main muscles below this at its start time are worth a suggestion
export const READY = 85; // muscles at or above this count as recovered
const MAX = 3;

const when = (day, start, todayIdx) => `${day === todayIdx ? 'today' : day === todayIdx + 1 ? 'tomorrow' : DAYS[day]} ${fmtTime(start)}`;
const listWords = (xs) => xs.join(', ').replace(/, ([^,]*)$/, ' and $1');

/**
 * @param o.sessions   this week's sessions [{ key, name, day, start, end, locked, pinned }]
 * @param o.todayIdx   0 = Monday
 * @param o.nowMin     minutes past midnight
 * @param o.isDone     (s) => bool
 * @param o.mainGroups (s) => ['quads', ...] main muscles a session works
 * @param o.freshAt    (day, startMin) => { quads: 62, ... } estimated group freshness at that time
 * @param o.labels     { quads: 'Quads', ... }
 * @param o.readiness  today's check-in result ({ level, reasons }) or null
 * @param o.report     today's own words ({ sore: [groups], tired, fresh: [groups] }) or null
 * @param o.freeSlot   (day, length) => { start, end } | null, a time that fits commitments and training hours
 * @param o.fits       (day, start, end) => bool, whether a time fits commitments and training hours
 * @param o.dismissed  proposal ids the user said no to
 * @returns { proposals, notes }
 */
export function proposeChanges(o) {
  const { sessions, todayIdx, nowMin, isDone, mainGroups, freshAt, labels = {}, readiness, report, freeSlot, fits = () => true, dismissed = [] } = o;
  const proposals = [];
  const notes = [];
  const used = new Set();
  const upcoming = sessions.filter((s) => !isDone(s) && (s.day > todayIdx || (s.day === todayIdx && s.start > nowMin)));
  const taken = new Set(sessions.map((s) => s.day));
  const tired = (readiness && readiness.level === 'rough') || !!(report && report.tired);
  const flat = readiness && readiness.level === 'easy';
  const sore = new Set((report && report.sore) || []);
  const fine = new Set((report && report.fresh) || []);

  // Estimated freshness of a session's main muscles at a time, with what they said today taken into account.
  const fresh = (s, day, start) => {
    const f = freshAt(day, start);
    return mainGroups(s).map((g) => ({ g, v: day <= todayIdx + 1 && sore.has(g) ? Math.min(f[g] ?? 100, 50) : fine.has(g) ? Math.max(f[g] ?? 100, READY) : f[g] ?? 100 }));
  };
  const worst = (list) => list.reduce((a, b) => (b.v < a.v ? b : a), { g: null, v: 100 });
  const named = (list) => listWords(list.filter((x) => x.v < TIRED).sort((a, b) => a.v - b.v).map((x) => `${(labels[x.g] || x.g).toLowerCase()} about ${x.v}%`));
  const add = (p) => { if (!dismissed.includes(p.id) && proposals.length < MAX) { proposals.push(p); p.keys.forEach((k) => used.add(k)); } };

  // Only the next two days: further out, recovery will have changed by then.
  for (const s of upcoming.filter((x) => x.day <= todayIdx + 1)) {
    if (used.has(s.key)) continue;
    const mine = fresh(s, s.day, s.start);
    const w = worst(mine);
    const musclesTired = w.v < TIRED;
    const overall = s.day === todayIdx && tired;
    if (!musclesTired && !overall && !(s.day === todayIdx && flat && w.v < READY)) continue;
    if (s.locked) { notes.push(`${s.name} is locked, so Slotted won’t suggest changing it.`); continue; }
    const len = s.end - s.start;
    const why = [
      musclesTired ? `Your ${named(mine)} recovered at ${when(s.day, s.start, todayIdx)} (estimated from your logged training${sore.size ? ' and what you said today' : ''}).` : '',
      overall && readiness && readiness.level === 'rough' ? `Your check-in today says you’re having a rough day${readiness.reasons && readiness.reasons.length ? ` (${listWords(readiness.reasons)})` : ''}.` : '',
      overall && report && report.tired && !(readiness && readiness.level === 'rough') ? 'You said you’re very tired today.' : '',
    ].filter(Boolean).join(' ');

    // 1. Swap with a later session whose muscles are ready now (not on a very tired day: that still means training hard).
    if (musclesTired && !overall) {
      const other = upcoming.find((t) => t.key !== s.key && t.day > s.day && !t.locked && !used.has(t.key)
        && worst(fresh(t, s.day, s.start)).v >= READY && worst(fresh(s, t.day, t.start)).v >= TIRED
        && fits(s.day, s.start, s.start + (t.end - t.start)) && fits(t.day, t.start, t.start + len));
      if (other) {
        add({
          id: `swap:${s.key}+${other.key}:${s.day}`, kind: 'swap', keys: [s.key, other.key],
          title: `Swap ${s.name} and ${other.name}`,
          reason: `${why} ${other.name} works muscles that are recovered, so do it first and give these more time.`,
          moves: [
            { key: other.key, name: other.name, from: { day: other.day, start: other.start }, to: { day: s.day, start: s.start, end: s.start + (other.end - other.start) } },
            { key: s.key, name: s.name, from: { day: s.day, start: s.start }, to: { day: other.day, start: other.start, end: other.start + len } },
          ],
        });
        continue;
      }
    }
    // 2. Move to a later free day when the muscles (and the athlete) should be ready.
    let moved = null;
    for (let d = s.day + 1; d <= 6 && !moved; d++) {
      if (taken.has(d)) continue;
      const slot = freeSlot(d, len);
      if (!slot) continue;
      if (worst(fresh(s, d, slot.start)).v >= (musclesTired ? READY - 5 : TIRED)) moved = { day: d, ...slot };
    }
    if (moved) {
      add({
        id: `move:${s.key}:${s.day}>${moved.day}`, kind: overall ? 'rest' : 'move', keys: [s.key],
        title: overall ? `Rest today, do ${s.name} on ${DAYS[moved.day]}` : `Move ${s.name} to ${DAYS[moved.day]}`,
        reason: `${why} ${DAYS[moved.day]} has free time and more recovery.`,
        moves: [{ key: s.key, name: s.name, from: { day: s.day, start: s.start }, to: { day: moved.day, start: moved.start, end: moved.start + Math.min(len, moved.end - moved.start) } }],
      });
      continue;
    }
    // 3. Otherwise keep it, lighter.
    add({
      id: `lighten:${s.key}:${s.day}`, kind: 'lighten', keys: [s.key],
      title: `Make ${s.name} lighter`,
      reason: `${why} There’s no better day left this week, so keep the session but go easier: one set less on each exercise and about 10% lighter.`,
      moves: [],
    });
  }
  return { proposals, notes };
}

// Apply an accepted proposal to this week's plan (returns a new plan list, and lightened keys).
export function applyProposal(plan, p, lightened = []) {
  if (p.kind === 'lighten') return { plan, lightened: [...new Set([...lightened, ...p.keys])] };
  const out = plan.map((s) => {
    const m = p.moves.find((x) => x.key === s.key);
    return m ? { ...s, day: m.to.day, start: m.to.start, end: m.to.end, pinned: true } : s;
  });
  return { plan: out.sort((a, b) => a.day - b.day), lightened };
}

/**
 * Free mornings: a session planned after midday on a day whose morning is free (for example school starts late).
 * The question is whether to move it to that morning. App logic finds it; nothing changes until the athlete says yes.
 * @param o.sessions    this week's sessions [{ key, name, day, start, end, locked, pinned }]
 * @param o.todayIdx    0 = Monday
 * @param o.nowMin      minutes past midnight
 * @param o.isDone      (s) => bool
 * @param o.morningSlot (day, length) => { start, end, until, first } | null (see morningSlot in scheduler.js)
 * @param o.skip        (s) => bool, true when this session shouldn't move (can't train that day, heavy legs before a game, ...)
 * @param o.dismissed   proposal ids the athlete said no to
 * @returns { proposals }
 */
export function proposeMornings(o) {
  const { sessions, todayIdx, nowMin, isDone, morningSlot, skip = () => false, dismissed = [] } = o;
  const proposals = [];
  for (const s of sessions) {
    if (proposals.length >= 2) break;
    const id = `morning:${s.key}:${s.day}`;
    if (isDone(s) || s.locked || s.pinned || dismissed.includes(id) || skip(s)) continue;
    if (s.day < todayIdx || (s.day === todayIdx && s.start <= nowMin)) continue;
    if (s.start < 12 * 60) continue; // already a morning session
    const len = s.end - s.start;
    const slot = morningSlot(s.day, len);
    if (!slot) continue;
    if (s.day === todayIdx && slot.start <= nowMin + 15) continue; // that time has gone
    const first = slot.first;
    const travel = first && first.before ? `, allowing ${first.before} minutes to get there` : '';
    proposals.push({
      id, kind: 'morning', keys: [s.key],
      title: `Do ${s.name} on ${s.day === todayIdx ? 'today' : DAYS[s.day]} at ${fmtTime(slot.start)}?`,
      reason: `${s.day === todayIdx ? 'This morning' : `${DAYS[s.day]} morning`} is free${first ? `: your first commitment${first.type === 'school' ? ' (school)' : first.label ? ` (${first.label})` : ''} doesn’t start until ${fmtTime(first.start)}${travel}` : ''}, so you could train before it. It’s planned for ${fmtTime(s.start)} at the moment.`,
      moves: [{ key: s.key, name: s.name, from: { day: s.day, start: s.start }, to: { day: s.day, start: slot.start, end: slot.end } }],
    });
  }
  return { proposals };
}
