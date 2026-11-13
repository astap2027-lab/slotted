// Daybook core: data, dates, lists, quick entry, snooze and saving.
// Same rules and the same saved format as the macOS app (daybook-mac/Shared/Core),
// so a backup from one opens in the other. No DOM here, so it can be tested in Node.

// ---------- Days ("2026-11-13": a calendar day, no time zone) ----------

export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDayKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

/** Midday on that day (midday always exists, even on daylight-saving days). */
export function noon(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
export function atTime(k, h, min) {
  const d = noon(k);
  d.setHours(h, min, 0, 0);
  return d;
}
export function addDays(k, n) {
  const d = noon(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function addMonths(k, n) {
  const d = noon(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dayKey(d);
}
export const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 86400000);
export const weekday = (k) => noon(k).getDay(); // 0 = Sunday
export const todayKey = (now = new Date()) => dayKey(now);

// Saved times are seconds since 1970, like the Mac app.
export const toSec = (date) => date.getTime() / 1000;
export const fromSec = (s) => new Date(s * 1000);
export const nowSec = (now = new Date()) => toSec(now);

// ---------- Records ----------

export const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    })).toUpperCase();

export const PRIORITIES = ['None', 'Low', 'Medium', 'High'];
export const UNITS = ['day', 'week', 'month', 'year'];

export function newTask(fields = {}, now = new Date()) {
  const t = nowSec(now);
  return {
    id: uuid(),
    title: '',
    details: '',
    dueDay: null,
    reminder: null,
    isImportant: false,
    priority: 0,
    recurrence: null,
    isCompleted: false,
    completedAt: null,
    isArchived: false,
    sortIndex: 0,
    seriesID: null,
    createdAt: t,
    modifiedAt: t,
    ...fields,
  };
}

export function newNote(fields = {}, now = new Date()) {
  const t = nowSec(now);
  return { id: uuid(), title: '', body: '', checklist: [], isPinned: false, createdAt: t, modifiedAt: t, ...fields };
}

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v) => v === true;

function cleanRecurrence(r) {
  if (!r || typeof r !== 'object') return null;
  return { unit: UNITS.includes(r.unit) ? r.unit : 'day', interval: Math.max(1, Math.floor(num(r.interval, 1))) };
}

/** Reads one task leniently. Returns null if it has no id. */
export function cleanTask(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const created = num(raw.createdAt, 0);
  const p = num(raw.priority, 0);
  return {
    ...raw, // keep fields from newer versions
    id: raw.id,
    title: str(raw.title),
    details: str(raw.details),
    dueDay: isDayKey(raw.dueDay) ? raw.dueDay : null,
    reminder: num(raw.reminder),
    isImportant: bool(raw.isImportant),
    priority: [0, 1, 2, 3].includes(p) ? p : 0,
    recurrence: cleanRecurrence(raw.recurrence),
    isCompleted: bool(raw.isCompleted),
    completedAt: num(raw.completedAt),
    isArchived: bool(raw.isArchived),
    sortIndex: num(raw.sortIndex, 0),
    seriesID: typeof raw.seriesID === 'string' ? raw.seriesID : null,
    createdAt: created,
    modifiedAt: num(raw.modifiedAt, created),
  };
}

export function cleanNote(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const created = num(raw.createdAt, 0);
  const list = Array.isArray(raw.checklist) ? raw.checklist : [];
  return {
    ...raw,
    id: raw.id,
    title: str(raw.title),
    body: str(raw.body),
    checklist: list
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({ id: typeof i.id === 'string' && i.id ? i.id : uuid(), text: str(i.text), isDone: bool(i.isDone) })),
    isPinned: bool(raw.isPinned),
    createdAt: created,
    modifiedAt: num(raw.modifiedAt, created),
  };
}

function unique(items) {
  const best = new Map();
  items.forEach((item, i) => {
    const prev = best.get(item.id);
    if (prev === undefined || item.modifiedAt > items[prev].modifiedAt) best.set(item.id, i);
  });
  const keep = new Set(best.values());
  return items.filter((_, i) => keep.has(i));
}

/** Reads saved data leniently: one damaged item can't hide the rest; duplicate ids are merged. */
export function cleanData(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const tasks = (Array.isArray(obj.tasks) ? obj.tasks : []).map(cleanTask).filter(Boolean);
  const notes = (Array.isArray(obj.notes) ? obj.notes : []).map(cleanNote).filter(Boolean);
  return { schemaVersion: num(obj.schemaVersion, 1), tasks: unique(tasks), notes: unique(notes) };
}

export const emptyData = () => ({ schemaVersion: 1, tasks: [], notes: [] });

// ---------- Changes (every change goes through these) ----------

export const findTask = (data, id) => data.tasks.find((t) => t.id === id) ?? null;
export const findNote = (data, id) => data.notes.find((n) => n.id === id) ?? null;

export function addTask(data, task) {
  const title = (task.title ?? '').trim();
  if (!title || data.tasks.some((t) => t.id === task.id)) return false;
  const lowest = data.tasks.length ? Math.min(...data.tasks.map((t) => t.sortIndex)) : 1;
  data.tasks.push({ ...task, title, sortIndex: lowest - 1 });
  return true;
}

export function updateTask(data, id, change, now = new Date()) {
  const i = data.tasks.findIndex((t) => t.id === id);
  if (i < 0) return;
  const before = JSON.stringify(data.tasks[i]);
  const copy = structuredClone(data.tasks[i]);
  change(copy);
  copy.id = id;
  if (JSON.stringify(copy) !== before) {
    copy.modifiedAt = nowSec(now);
    data.tasks[i] = copy;
  }
}

export function deleteTask(data, id) {
  data.tasks = data.tasks.filter((t) => t.id !== id);
}

export function nextRepeat(rule, k) {
  const n = Math.max(1, rule.interval || 1);
  switch (rule.unit) {
    case 'week': return addDays(k, 7 * n);
    case 'month': return addMonths(k, n);
    case 'year': return addMonths(k, 12 * n);
    default: return addDays(k, n);
  }
}

export function repeatSummary(rule) {
  const n = Math.max(1, rule.interval || 1);
  return n === 1 ? `Every ${rule.unit}` : `Every ${n} ${rule.unit}s`;
}

export function effectiveDay(task) {
  if (task.dueDay) return task.dueDay;
  if (task.reminder != null) return dayKey(fromSec(task.reminder));
  return null;
}

/** Marks a task done or not done. Safe to repeat. Returns 'completed' | 'reopened' | {repeated: day} | null. */
export function setCompleted(data, id, done, now = new Date()) {
  const i = data.tasks.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const task = structuredClone(data.tasks[i]);
  const t = nowSec(now);

  if (!done) {
    if (!task.isCompleted && !task.isArchived) return 'reopened';
    Object.assign(task, { isCompleted: false, completedAt: null, isArchived: false, modifiedAt: t });
    data.tasks[i] = task;
    return 'reopened';
  }
  if (task.isCompleted) return 'completed';

  if (task.recurrence) {
    const record = { ...structuredClone(task), id: uuid(), recurrence: null, seriesID: task.id, isCompleted: true, completedAt: t, modifiedAt: t };
    const today = todayKey(now);
    let next = nextRepeat(task.recurrence, effectiveDay(task) ?? today);
    for (let steps = 0; next <= today && steps < 5000; steps++) next = nextRepeat(task.recurrence, next);
    if (task.reminder != null) {
      const r = fromSec(task.reminder);
      task.reminder = toSec(atTime(next, r.getHours(), r.getMinutes()));
    }
    task.dueDay = next;
    task.modifiedAt = t;
    data.tasks[i] = task;
    data.tasks.push(record);
    return { repeated: next };
  }

  Object.assign(task, { isCompleted: true, completedAt: t, modifiedAt: t });
  data.tasks[i] = task;
  return 'completed';
}

export function toggleCompletion(data, id, now = new Date()) {
  const task = findTask(data, id);
  return task ? setCompleted(data, id, !task.isCompleted, now) : null;
}

export function snooze(data, id, until, now = new Date()) {
  updateTask(data, id, (t) => { if (!t.isCompleted) t.reminder = toSec(until); }, now);
}

/** Puts these tasks in this order, reusing their own order slots. */
export function reorder(data, ids) {
  const slots = ids.map((id) => findTask(data, id)?.sortIndex).filter((v) => v != null).sort((a, b) => a - b);
  if (slots.length !== ids.length) return;
  const spread = [];
  for (const s of slots) spread.push(spread.length && s <= spread[spread.length - 1] ? spread[spread.length - 1] + 0.001 : s);
  ids.forEach((id, pos) => { const t = findTask(data, id); if (t) t.sortIndex = spread[pos]; });
}

export function archiveCompleted(data, now = new Date()) {
  let n = 0;
  for (const t of data.tasks) {
    if (t.isCompleted && !t.isArchived) { t.isArchived = true; t.modifiedAt = nowSec(now); n++; }
  }
  return n;
}

export function deleteArchived(data) {
  const before = data.tasks.length;
  data.tasks = data.tasks.filter((t) => !t.isArchived);
  return before - data.tasks.length;
}

export function addNote(data, note) {
  if (data.notes.some((n) => n.id === note.id)) return false;
  data.notes.push(note);
  return true;
}

export function updateNote(data, id, change, now = new Date()) {
  const i = data.notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  const before = JSON.stringify(data.notes[i]);
  const copy = structuredClone(data.notes[i]);
  change(copy);
  copy.id = id;
  if (JSON.stringify(copy) !== before) {
    copy.modifiedAt = nowSec(now);
    data.notes[i] = copy;
  }
}

export function deleteNote(data, id) {
  data.notes = data.notes.filter((n) => n.id !== id);
}

export function noteTitle(note) {
  const t = note.title.trim();
  if (t) return t;
  const first = note.body.split('\n').map((l) => l.trim()).find(Boolean);
  return first || 'New Note';
}

export function notePreview(note) {
  const lines = note.body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!note.title.trim() && lines.length) lines.shift();
  return lines.join(' ');
}

// ---------- Lists ----------

export function planner(now = new Date()) {
  const today = todayKey(now);
  const isOverdue = (t) => { if (t.isCompleted) return false; const d = effectiveDay(t); return d != null && d < today; };
  const inToday = (t) => {
    if (t.isCompleted || t.isArchived) return false;
    const d = effectiveDay(t);
    return d != null ? d <= today : t.isImportant;
  };
  const upcoming = (t) => { if (t.isCompleted || t.isArchived) return false; const d = effectiveDay(t); return d != null && d > today; };
  const inbox = (t) => !t.isCompleted && !t.isArchived && effectiveDay(t) == null;
  const doneToday = (t) => t.isCompleted && t.completedAt != null && dayKey(fromSec(t.completedAt)) === today;

  const tie = (a, b) => (a.sortIndex - b.sortIndex) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const moment = (t) => t.reminder ?? (effectiveDay(t) ? toSec(atTime(effectiveDay(t), 23, 59)) : Infinity);

  function sorted(list, sort) {
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'dueDate': { const d = moment(a) - moment(b); if (d) return d; break; }
        case 'priority':
          if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          break;
        case 'title': { const c = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }); if (c) return c; break; }
        case 'created': if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt; break;
        default: break;
      }
      return tie(a, b);
    });
  }

  function dayTitle(k) {
    const off = daysBetween(today, k);
    if (off === 0) return 'Today';
    if (off === 1) return 'Tomorrow';
    if (off === -1) return 'Yesterday';
    const d = noon(k);
    if (off >= 2 && off <= 6) return d.toLocaleDateString(undefined, { weekday: 'long' });
    const opts = { weekday: 'long', day: 'numeric', month: 'long' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  return {
    now, today, isOverdue, inToday, upcoming, inbox, doneToday, sorted, dayTitle,

    todayOpen: (tasks) => tasks.filter(inToday),
    doneTodayList: (tasks) => tasks.filter(doneToday).sort((a, b) => b.completedAt - a.completedAt),

    progress(tasks) {
      const done = tasks.filter(doneToday).length;
      return { done, total: done + tasks.filter(inToday).length };
    },

    widgetOrder(tasks) {
      return tasks.filter(inToday).sort((a, b) => {
        const oa = isOverdue(a), ob = isOverdue(b);
        if (oa !== ob) return oa ? -1 : 1;
        if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return tie(a, b);
      });
    },

    todayGroups(tasks, sort) {
      const open = tasks.filter(inToday);
      const overdue = sorted(open.filter(isOverdue), sort);
      const current = sorted(open.filter((t) => !isOverdue(t)), sort);
      const done = tasks.filter((t) => doneToday(t) && !t.isArchived).sort((a, b) => b.completedAt - a.completedAt);
      const g = [];
      if (overdue.length) g.push({ id: 'overdue', title: 'Overdue', tasks: overdue, canReorder: sort === 'manual' });
      if (current.length) g.push({ id: 'today', title: 'Today', tasks: current, canReorder: sort === 'manual' });
      if (done.length) g.push({ id: 'done', title: 'Done Today', tasks: done, canReorder: false });
      return g;
    },

    upcomingGroups(tasks, sort) {
      const by = new Map();
      for (const t of tasks.filter(upcoming)) {
        const k = effectiveDay(t);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(t);
      }
      return [...by.keys()].sort().map((k) => ({ id: k, title: dayTitle(k), tasks: sorted(by.get(k), sort), canReorder: sort === 'manual' }));
    },

    inboxGroups(tasks, sort) {
      const list = sorted(tasks.filter(inbox), sort);
      return list.length ? [{ id: 'inbox', title: 'Inbox', tasks: list, canReorder: sort === 'manual' }] : [];
    },

    completedGroups(tasks, includeArchived) {
      const done = tasks
        .filter((t) => t.isCompleted && (includeArchived || !t.isArchived))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      const order = [];
      const by = new Map();
      for (const t of done) {
        const k = dayKey(fromSec(t.completedAt ?? t.modifiedAt));
        if (!by.has(k)) { by.set(k, []); order.push(k); }
        by.get(k).push(t);
      }
      return order.map((k) => ({ id: 'done-' + k, title: dayTitle(k), tasks: by.get(k), canReorder: false }));
    },

    greeting(name) {
      const h = now.getHours();
      const base = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
      const n = (name ?? '').trim();
      return n ? `${base}, ${n}` : base;
    },

    search(query, data) {
      const words = query.split(/\s+/).filter(Boolean).map(fold);
      if (!words.length) return { tasks: [], notes: [] };
      const match = (s) => { const f = fold(s); return words.every((w) => f.includes(w)); };
      return {
        tasks: data.tasks.filter((t) => match(t.title + '\n' + t.details))
          .sort((a, b) => (a.isCompleted !== b.isCompleted ? (a.isCompleted ? 1 : -1) : b.modifiedAt - a.modifiedAt)),
        notes: data.notes.filter((n) => match(n.title + '\n' + n.body + '\n' + n.checklist.map((i) => i.text).join('\n')))
          .sort((a, b) => b.modifiedAt - a.modifiedAt),
      };
    },

    sortedNotes(notes) {
      return [...notes].sort((a, b) => (a.isPinned !== b.isPinned ? (a.isPinned ? -1 : 1) : (b.modifiedAt - a.modifiedAt) || (a.id < b.id ? -1 : 1)));
    },
  };
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Quick entry ("Email teacher tomorrow 3pm !") ----------

const TIME_RE = /(?:^|\s)(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)$|(?:^|\s)at\s+(\d{1,2})[:.](\d{2})$/i;
const WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

function trailingTime(text) {
  const m = text.match(TIME_RE);
  if (!m) return null;
  let hour, minute;
  if (m[1] != null) {
    hour = Number(m[1]);
    minute = m[2] != null ? Number(m[2]) : 0;
    if (hour < 1 || hour > 12) return null;
    const pm = m[3].toLowerCase().startsWith('p');
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  } else {
    hour = Number(m[4]);
    minute = Number(m[5]);
    if (hour > 23) return null;
  }
  if (minute > 59) return null;
  return { hour, minute, rest: text.slice(0, m.index).trim() };
}

function trailingDay(text, today) {
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) return null;
  const last = words[words.length - 1].toLowerCase();
  if (last === 'week' && words.length >= 3 && words[words.length - 2].toLowerCase() === 'next') {
    const off = (1 - weekday(today) + 7) % 7;
    return { day: addDays(today, off === 0 ? 7 : off), rest: words.slice(0, -2).join(' '), tonight: false };
  }
  let day = null, tonight = false;
  if (last === 'today') day = today;
  else if (last === 'tonight') { day = today; tonight = true; }
  else if (['tomorrow', 'tmrw', 'tmr'].includes(last)) day = addDays(today, 1);
  else if (last in WEEKDAYS) day = addDays(today, (WEEKDAYS[last] - weekday(today) + 7) % 7);
  if (!day) return null;
  words.pop();
  if (words.length >= 2 && ['on', 'by', 'this'].includes(words[words.length - 1].toLowerCase())) words.pop();
  return { day, rest: words.join(' '), tonight };
}

/** Returns { title, isImportant, day, reminder (Date|null) } or null for empty text. */
export function parseQuickEntry(raw, now = new Date()) {
  let text = (raw ?? '').trim();
  if (!text) return null;
  const original = text;
  let important = false;
  if (text.startsWith('!')) { important = true; text = text.replace(/^!+/, '').trim(); }
  if (text.endsWith('!')) { important = true; text = text.replace(/!+$/, '').trim(); }

  const today = todayKey(now);
  let time = null, day = null;
  const t1 = trailingTime(text);
  if (t1) { time = t1; text = t1.rest; }
  const d = trailingDay(text, today);
  if (d) { day = d.day; text = d.rest; if (d.tonight && !time) time = { hour: 19, minute: 0 }; }
  if (day && !time) { const t2 = trailingTime(text); if (t2) { time = t2; text = t2.rest; } }

  text = text.trim();
  if (!text) return { title: original, isImportant: false, day: null, reminder: null };

  let reminder = null;
  if (time) {
    let moment = atTime(day ?? today, time.hour, time.minute);
    if (!day && moment <= now) moment = atTime(addDays(today, 1), time.hour, time.minute);
    reminder = moment;
    if (!day) day = dayKey(moment);
  }
  return { title: text, isImportant: important, day, reminder };
}

// ---------- Snooze ----------

export const SNOOZES = [
  { id: 'fiveMinutes', title: '5 min' },
  { id: 'fifteenMinutes', title: '15 min' },
  { id: 'oneHour', title: '1 hour' },
  { id: 'laterToday', title: 'Later today' },
];

export function snoozeUntil(option, now = new Date()) {
  const t = now.getTime();
  switch (option) {
    case 'fiveMinutes': return new Date(t + 5 * 60e3);
    case 'fifteenMinutes': return new Date(t + 15 * 60e3);
    case 'oneHour': return new Date(t + 60 * 60e3);
    default: {
      const today = todayKey(now);
      const six = atTime(today, 18, 0);
      if (t < six.getTime() - 2 * 3600e3) return six;
      const late = atTime(today, 23, 0).getTime();
      let c = Math.min(t + 3 * 3600e3, late);
      if (c < t + 3600e3) c = t + 3600e3;
      const d = new Date(c);
      const rem = d.getMinutes() % 15;
      if (rem || d.getSeconds() || d.getMilliseconds()) d.setMinutes(d.getMinutes() + (15 - rem), 0, 0);
      return d;
    }
  }
}

// ---------- Saving ----------

/**
 * Saves to browser storage (localStorage). The previous good copy is kept as a
 * backup; a copy that can't be read is set aside and never overwritten.
 */
export function createStore(storage, key = 'daybook:v1') {
  const backupKey = key + ':backup';
  const parse = (text) => cleanData(JSON.parse(text));

  function load() {
    const text = storage.getItem(key);
    if (text == null) {
      const b = storage.getItem(backupKey);
      if (b != null) { try { return parse(b); } catch { /* fall through */ } }
      return emptyData();
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      return cleanData(parsed);
    } catch (err) {
      const keep = `${key}:unreadable:${Date.now()}`;
      try { storage.setItem(keep, text); } catch { /* storage full */ }
      const b = storage.getItem(backupKey);
      if (b != null) { try { return parse(b); } catch { /* fall through */ } }
      const e = new Error("Daybook couldn't read its saved data, so it won't overwrite it.");
      e.unreadable = true;
      throw e;
    }
  }

  function save(data) {
    const current = storage.getItem(key);
    if (current != null) {
      try { JSON.parse(current); storage.setItem(backupKey, current); } catch { /* keep old backup */ }
    }
    storage.setItem(key, JSON.stringify(data));
  }

  /** Read the latest, change it, save it. Returns { result, data }. */
  function mutate(change) {
    const data = load();
    const before = JSON.stringify(data);
    const result = change(data);
    if (JSON.stringify(data) !== before) save(data);
    return { result, data };
  }

  return { load, save, mutate, key };
}
