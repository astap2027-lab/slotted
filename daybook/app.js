// Daybook web app: every screen, saving, reminders and shortcuts. Logic lives in core.js.
import * as C from './core.js';

// Where Daybook runs. The website uses the browser directly; another host (such as a
// claude.ai page) can supply its own storage, file saving and status via window.DAYBOOK_HOST.
const HOST = globalThis.DAYBOOK_HOST ?? {};
const STORAGE = HOST.storage ?? (() => { try { return window.localStorage; } catch { return null; } })();
const CAN_NOTIFY = !HOST.noSystemNotifications && 'Notification' in window;

// ---------- Helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tray: '<path d="M3.5 13.5 6.5 5h11l3 8.5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5H8l1 2.5h6l1-2.5h4.5"/>',
  note: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M9.5 10h6M9.5 13.5h6M9.5 17h4"/>',
  done: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.4 2.6 2.6L16 9.8"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  bell: '<path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  bellOff: '<path d="M8 6.4A5.5 5.5 0 0 1 17.5 11v5l1.5 2H9M6.5 11v5L5 18M10 20.5a2 2 0 0 0 4 0M3.5 3.5l17 17"/>',
  repeat: '<path d="m17 3 3 3-3 3"/><path d="M4 11.5V10a4 4 0 0 1 4-4h12M7 21l-3-3 3-3"/><path d="M20 12.5V14a4 4 0 0 1-4 4H4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M9 3.5h6l-1 5.5 3.5 4h-11L10 9z"/><path d="M12 13v7.5"/>',
  x: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  sort: '<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M15 4.5v15"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  reply: '<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5v1"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18.5v-9A1.5 1.5 0 0 1 6.5 8H11"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtWeekday = (d) => d.toLocaleDateString(undefined, { weekday: 'long' });
const fmtDayMonth = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
const fmtShort = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtFull = (d) => d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
function fmtReminder(sec, p) {
  const d = C.fromSec(sec);
  const off = C.daysBetween(p.today, C.dayKey(d));
  if (off === 0) return fmtTime(d);
  if (off === 1) return 'Tomorrow ' + fmtTime(d);
  if (off === -1) return 'Yesterday ' + fmtTime(d);
  return fmtShort(d) + ', ' + fmtTime(d);
}
function ago(sec) {
  const s = Date.now() / 1000 - sec;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return C.fromSec(sec).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const toLocalInput = (d) => `${C.dayKey(d)}T${C.pad(d.getHours())}:${C.pad(d.getMinutes())}`;
function fromLocalInput(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

// ---------- State ----------

const VIEWS = [
  { id: 'today', title: 'Today', icon: 'sun', key: '1' },
  { id: 'upcoming', title: 'Upcoming', icon: 'calendar', key: '2' },
  { id: 'inbox', title: 'Inbox', icon: 'tray', key: '3' },
  { id: 'notes', title: 'Notes', icon: 'note', key: '4' },
  { id: 'completed', title: 'Completed', icon: 'done', key: '5' },
  { id: 'mail', title: 'Email', icon: 'mail', key: '6' },
];
// The Email view needs a host that can read Gmail (the claude.ai page). The website hides it.
const shownViews = () => VIEWS.filter((v) => v.id !== 'mail' || HOST.mail);
const SORTS = [['manual', 'Manual'], ['dueDate', 'Date'], ['priority', 'Priority'], ['title', 'Title'], ['created', 'Newest First']];
const takesEntry = (v) => v === 'today' || v === 'upcoming' || v === 'inbox';

const PREFS_KEY = 'daybook:prefs';
function loadPrefs() {
  try { return { name: '', theme: 'system', sort: 'manual', onboarded: false, ...JSON.parse(STORAGE?.getItem(PREFS_KEY) || '{}') }; }
  catch { return { name: '', theme: 'system', sort: 'manual', onboarded: false }; }
}
const prefs = loadPrefs();
function savePrefs() { try { STORAGE?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }

let store = null;
let data = C.emptyData();
let readOnly = false;
let startupError = null;
try {
  if (!STORAGE) throw new Error('no storage');
  store = C.createStore(STORAGE);
  data = store.load();
} catch (err) {
  readOnly = true;
  startupError = err.unreadable
    ? "Daybook couldn't read its saved data. Nothing has been overwritten. Open Settings → Data to export what's there, or ask for help."
    : 'This browser is blocking storage, so Daybook can\'t save. Check that cookies and site data are allowed.';
}

const ui = {
  view: 'today', taskId: null, noteId: null, search: '', quickText: '', compactText: '',
  importantOnly: false, showArchived: false, now: new Date(), settingsTab: 'general',
  // Email summary, kept only while the page is open (email text is never saved).
  mail: { status: 'idle', step: '', error: '', items: [], summary: null, at: null, days: 3, scroll: 0 },
};
let installPrompt = null;
let swReg = null;

const P = () => C.planner(ui.now);

// ---------- Saving ----------

function change(fn, { inspector = true } = {}) {
  if (readOnly || !store) { toast(startupError ?? "Daybook can't save right now."); return undefined; }
  try {
    const { result, data: fresh } = store.mutate(fn);
    data = fresh;
    askToKeepStorage();
    render({ inspector });
    return result;
  } catch (err) {
    console.error(err);
    toast(err?.name === 'QuotaExceededError' ? 'Storage is full. Export a backup and delete old items.' : (err.message || 'Couldn\'t save.'));
    return undefined;
  }
}

let persistAsked = false;
function askToKeepStorage() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

// ---------- Rendering ----------

function render({ inspector = true } = {}) {
  ui.now = new Date();
  keepFocus(() => {
    renderSidebar();
    renderMain();
    renderCompact();
  });
  if (inspector) renderInspector();
  else refreshInspectorBits();
  renderAlerts();
  updateBadge();
}

/** Re-render without losing the cursor in a text box. */
function keepFocus(fn) {
  const el = document.activeElement;
  const id = el?.id;
  const start = el?.selectionStart, end = el?.selectionEnd;
  fn();
  if (id && el !== document.activeElement) {
    const again = document.getElementById(id);
    if (again) {
      again.focus({ preventScroll: true });
      try { if (start != null) again.setSelectionRange(start, end); } catch { /* not a text box */ }
    }
  }
}

function ringSVG(done, total, size = 30, width = 3) {
  const r = (size - width) / 2, c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  const label = total && done === total
    ? `<svg viewBox="0 0 24 24" width="${size * 0.42}" height="${size * 0.42}" style="stroke:var(--ink);stroke-width:3;fill:none"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`
    : `${done}/${total}`;
  return `<div class="ring" style="width:${size}px;height:${size}px" title="${done} of ${total} done today">
    <svg width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${width}"/>
    <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${width}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg>
    <div class="label" style="font-size:${size * 0.28}px">${label}</div></div>`;
}

function counts(p) {
  return {
    today: p.todayOpen(data.tasks).length,
    upcoming: data.tasks.filter(p.upcoming).length,
    inbox: data.tasks.filter(p.inbox).length,
  };
}

function renderSidebar() {
  const p = P();
  const prog = p.progress(data.tasks);
  const n = counts(p);
  const denied = CAN_NOTIFY && Notification.permission === 'denied';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#sidebar').innerHTML = `
    <div class="side-head">
      ${ringSVG(prog.done, prog.total, 32, 3)}
      <div style="min-width:0">
        <div class="t1">${esc(p.greeting(prefs.name))}</div>
        <div class="t2">${prog.total ? `${prog.done} of ${prog.total} done today` : esc(fmtShort(ui.now))}</div>
      </div>
    </div>
    <label class="search">${icon('search')}<input id="search" type="search" placeholder="Search" value="${esc(ui.search)}" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
    <nav class="nav">
      ${shownViews().map((v) => `<button data-act="view" data-v="${v.id}" class="${ui.view === v.id && !ui.search ? 'on' : ''}" title="${v.title} (${v.key})">
        ${icon(v.icon)}<span>${v.title}</span>${n[v.id] ? `<span class="count">${n[v.id]}</span>` : ''}</button>`).join('')}
    </nav>
    <div class="side-foot">
      ${denied ? `<div class="notice"><b>${icon('bellOff')}Notifications are off</b>Reminders will only show inside Daybook. Allow notifications for this site in your browser's settings.</div>` : ''}
      ${installPrompt && !standalone ? `<button class="btn primary" data-act="install">Install Daybook</button>` : ''}
      ${HOST.statusText ? `<div class="hint" style="padding:0 9px">${esc(HOST.statusText())}</div>` : ''}
      <button class="side-btn" data-act="settings">${icon('gear')}Settings</button>
    </div>`;
}

function groupsFor(view, p) {
  const tasks = ui.importantOnly ? data.tasks.filter((t) => t.isImportant || t.priority === 3) : data.tasks;
  switch (view) {
    case 'today': return p.todayGroups(tasks, prefs.sort);
    case 'upcoming': return p.upcomingGroups(tasks, prefs.sort);
    case 'inbox': return p.inboxGroups(tasks, prefs.sort);
    case 'completed': return p.completedGroups(tasks, ui.showArchived);
    default: return [];
  }
}

function homeOf(t, p = P()) {
  if (t.isCompleted) return 'completed';
  if (p.inToday(t)) return 'today';
  if (p.upcoming(t)) return 'upcoming';
  return 'inbox';
}
const viewTitle = (id) => VIEWS.find((v) => v.id === id)?.title ?? id;

function rowHTML(t, p, { showDay = false, draggable = false } = {}) {
  const overdue = p.isOverdue(t);
  const meta = [];
  if (overdue) meta.push(`<span class="late">${icon('alert')}${esc(p.dayTitle(C.effectiveDay(t)))}</span>`);
  if (t.isCompleted && t.completedAt) meta.push(`<span>${icon('done')}Done ${esc(fmtTime(C.fromSec(t.completedAt)))}</span>`);
  if (showDay && !overdue && !t.isCompleted && t.dueDay) meta.push(`<span>${icon('calendar')}${esc(p.dayTitle(t.dueDay))}</span>`);
  if (t.reminder != null && !t.isCompleted) meta.push(`<span>${icon('bell')}${esc(fmtReminder(t.reminder, p))}</span>`);
  if (t.recurrence) meta.push(`<span>${icon('repeat')}${esc(C.repeatSummary(t.recurrence))}</span>`);
  const details = t.details.trim().split('\n')[0];
  return `<li class="row ${t.isCompleted ? 'done' : ''} ${ui.taskId === t.id ? 'sel' : ''}" data-id="${t.id}" ${draggable ? 'draggable="true"' : ''}>
    <button class="check p${t.priority} ${t.isCompleted ? 'on' : ''}" data-act="toggle" aria-label="${t.isCompleted ? 'Mark as not done' : 'Mark as done'}" title="${t.isCompleted ? 'Mark as not done' : 'Mark as done'}">${CHECK}</button>
    <div class="row-body">
      <div class="row-title">${t.priority && !t.isCompleted ? `<span class="prio p${t.priority}">${'!'.repeat(t.priority)}</span>` : ''}<span>${esc(t.title)}</span></div>
      ${details ? `<div class="row-details">${esc(details)}</div>` : ''}
      ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
    </div>
    ${t.isImportant ? '<span class="star" title="Important">★</span>' : ''}
  </li>`;
}

const EMPTY = {
  today: ['sun', 'Nothing planned for today', 'Type above and press Return to add a task. Press N from anywhere in Daybook to jump here.'],
  upcoming: ['calendar', 'Nothing coming up', 'Tasks with a future date show here, grouped by day.'],
  inbox: ['tray', 'Inbox is empty', "Somewhere to drop things that don't have a day yet."],
  completed: ['done', 'No completed tasks yet', 'Ticked-off tasks are kept here. You can restore any of them.'],
};

function renderMain() {
  const main = $('#main');
  if (ui.search.trim()) { main.innerHTML = searchHTML(); return; }
  if (ui.view === 'notes') { main.innerHTML = notesHTML(); return; }
  if (ui.view === 'mail') {
    const keep = $('#mailScroll')?.scrollTop ?? ui.mail.scroll;
    main.innerHTML = mailHTML();
    const sc = $('#mailScroll');
    if (sc) { sc.scrollTop = keep; sc.onscroll = () => { ui.mail.scroll = sc.scrollTop; }; }
    return;
  }

  const p = P();
  const view = ui.view;
  const groups = groupsFor(view, p);
  const prog = p.progress(data.tasks);
  const sub = { today: `${fmtWeekday(ui.now)} ${fmtDayMonth(ui.now)}`, upcoming: 'Planned for later', inbox: 'No date yet', completed: 'History' }[view];
  const tools = view === 'completed'
    ? `<button class="tool ${ui.showArchived ? 'on' : ''}" data-act="showArchived" title="Show archived tasks">${icon('archive')}Archived</button>
       <button class="tool" data-act="clearMenu" title="Archive or delete completed tasks">Clear…</button>`
    : `<button class="tool ${ui.importantOnly ? 'on' : ''}" data-act="importantOnly" title="Only important and high-priority tasks">${icon('star')}</button>
       <button class="tool" data-act="sortMenu" title="Sort">${icon('sort')}${esc(SORTS.find((s) => s[0] === prefs.sort)?.[1] ?? 'Manual')}</button>`;

  let body;
  if (!groups.some((g) => g.tasks.length)) {
    const [ic, title, text] = ui.importantOnly ? ['star', 'No important tasks', 'Turn off the star filter to see everything.'] : EMPTY[view];
    body = `<div class="empty"><div><div class="big">${icon(ic)}</div><h2>${title}</h2><p>${text}</p></div></div>`;
  } else {
    const showTitles = groups.length > 1 || view === 'upcoming' || view === 'completed';
    body = `<div class="scroll" id="list">${groups.map((g) => `
      <section class="group">
        ${showTitles ? `<h3 class="${g.id === 'overdue' ? 'overdue' : ''}">${esc(g.title)}</h3>` : ''}
        <ul class="rows" data-group="${esc(g.id)}">${g.tasks.map((t) => rowHTML(t, p, { showDay: view === 'inbox' || view === 'completed', draggable: g.canReorder })).join('')}</ul>
      </section>`).join('')}</div>`;
  }

  main.innerHTML = `
    <header class="head">
      <div><div class="eyebrow">${esc(sub)}</div><h1>${view === 'today' ? "Today's Tasks" : viewTitle(view)}</h1></div>
      <div class="right">
        ${view === 'today' ? `<div class="pct"><span>${prog.total ? Math.round((prog.done / prog.total) * 100) + '% done' : 'Nothing yet'}</span><div class="bar"><i style="width:${prog.total ? (prog.done / prog.total) * 100 : 0}%"></i></div></div>` : ''}
        <div class="tools">${tools}</div>
      </div>
    </header>
    ${takesEntry(view) ? quickHTML('quick', ui.quickText, view) : ''}
    ${body}`;
}

function quickHTML(id, value, view) {
  const ph = { upcoming: 'Add a task for tomorrow, or type a day: “Pack kit friday”', inbox: 'Add to Inbox (no date needed)' }[view]
    ?? 'Add a task, e.g. “Email teacher tomorrow 3pm”';
  return `<form class="quick" data-quick="${view}" autocomplete="off">
    <div class="quick-box"><span class="plus">${icon('plus')}</span>
      <input id="${id}" value="${esc(value)}" placeholder="${esc(ph)}" spellcheck="true" enterkeyhint="done" aria-label="New task">
      <kbd class="${value ? '' : 'hidden'}">↩</kbd></div>
    <div class="quick-hint" id="${id}-hint">${esc(quickHint(value))}</div>
  </form>`;
}

function quickHint(text) {
  const e = C.parseQuickEntry(text, new Date());
  if (!e || (!e.day && !e.reminder && !e.isImportant)) return '';
  const parts = [];
  if (e.day) parts.push(P().dayTitle(e.day));
  if (e.reminder) parts.push('remind at ' + fmtTime(e.reminder));
  if (e.isImportant) parts.push('important');
  return `“${e.title}” · ${parts.join(' · ')}`;
}

function searchHTML() {
  const p = P();
  const res = p.search(ui.search, data);
  if (!res.tasks.length && !res.notes.length) {
    return `<header class="head"><div><div class="eyebrow">Search</div><h1>“${esc(ui.search.trim())}”</h1></div></header>
      <div class="empty"><div><div class="big">${icon('search')}</div><h2>No results</h2><p>Check the spelling or try fewer words.</p></div></div>`;
  }
  const where = (t) => {
    if (t.isArchived) return 'Archived';
    if (t.isCompleted) return 'Completed ' + (t.completedAt ? C.fromSec(t.completedAt).toLocaleDateString() : '');
    const h = homeOf(t, p), d = C.effectiveDay(t);
    return d && h !== 'inbox' ? `${viewTitle(h)} · ${p.dayTitle(d)}` : viewTitle(h);
  };
  return `<header class="head"><div><div class="eyebrow">Search</div><h1>“${esc(ui.search.trim())}”</h1></div></header>
    <div class="scroll">
      ${res.tasks.length ? `<section class="group"><h3>Tasks</h3>${res.tasks.map((t) => `
        <div class="result" data-act="revealTask" data-id="${t.id}">
          <span class="check sm p${t.priority} ${t.isCompleted ? 'on' : ''}">${CHECK}</span>
          <div style="flex:1;min-width:0"><div style="${t.isCompleted ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</div><div class="sub">${esc(where(t))}</div></div>
          ${t.isImportant ? '<span class="star">★</span>' : ''}
        </div>`).join('')}</section>` : ''}
      ${res.notes.length ? `<section class="group"><h3>Notes</h3>${res.notes.map((n) => `
        <div class="result" data-act="revealNote" data-id="${n.id}">
          ${icon('note')}<div style="flex:1;min-width:0"><div>${esc(C.noteTitle(n))}</div><div class="sub">${esc(C.notePreview(n) || 'Edited ' + ago(n.modifiedAt))}</div></div>
        </div>`).join('')}</section>` : ''}
    </div>`;
}

// ---------- Notes ----------

function notesHTML() {
  const notes = P().sortedNotes(data.notes);
  if (ui.noteId && !C.findNote(data, ui.noteId)) ui.noteId = null;
  if (!ui.noteId && notes.length) ui.noteId = notes[0].id;
  const head = `<header class="head">
      <div><div class="eyebrow">Write it down</div><h1>Notes</h1></div>
      <div class="right"><button class="tool" data-act="newNote" title="New note (Shift-N)">${icon('edit')}New Note</button></div>
    </header>`;
  if (!notes.length) {
    return head + `<div class="empty"><div><div class="big">${icon('note')}</div><h2>No notes yet</h2>
      <p>Write longer things to remember, with checklists. Pin one to show it in the small-window view.</p>
      <p style="margin-top:14px"><button class="btn primary" data-act="newNote">New Note</button></p></div></div>`;
  }
  return head + `<div class="notes"><div class="note-list" id="noteList">${noteListHTML(notes)}</div><div class="note-edit" id="noteEdit">${noteEditHTML()}</div></div>`;
}

function noteListHTML(notes = P().sortedNotes(data.notes)) {
  return notes.map((n) => {
    const done = n.checklist.filter((i) => i.isDone).length;
    const bits = [ago(n.modifiedAt)];
    if (n.checklist.length) bits.push(`${done}/${n.checklist.length} ticked`);
    const prev = C.notePreview(n);
    if (prev) bits.push(prev);
    return `<div class="note-item ${n.id === ui.noteId ? 'sel' : ''}" data-act="selectNote" data-id="${n.id}">
      <div class="nt">${n.isPinned ? icon('pin') : ''}${esc(C.noteTitle(n))}</div>
      <div class="nm">${esc(bits.join(' · '))}</div></div>`;
  }).join('');
}

function noteEditHTML() {
  const n = C.findNote(data, ui.noteId);
  if (!n) return `<div class="empty"><div><h2>Select a note</h2></div></div>`;
  const done = n.checklist.filter((i) => i.isDone).length;
  return `<div class="wrap">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="hint" id="noteEdited">Edited ${esc(fmtFull(C.fromSec(n.modifiedAt)))}</span>
      <span style="margin-left:auto"></span>
      <button class="tool ${n.isPinned ? 'on' : ''}" data-act="pinNote" title="Pinned notes show in the small-window view">${icon('pin')}${n.isPinned ? 'Pinned' : 'Pin'}</button>
      <button class="tool" data-act="deleteNote" title="Delete note">${icon('trash')}</button>
    </div>
    <input class="note-title" id="noteTitle" data-nf="title" placeholder="Title" value="${esc(n.title)}">
    <textarea class="note-body" id="noteBody" data-nf="body" placeholder="Write anything…">${esc(n.body)}</textarea>
    <div class="cl-head">Checklist
      ${n.checklist.length ? `<span class="hint">${done} of ${n.checklist.length}</span><div class="bar"><i style="width:${(done / n.checklist.length) * 100}%"></i></div>` : ''}
      ${done ? '<button class="btn small" data-act="clClear">Remove ticked</button>' : ''}
    </div>
    <ul class="cl">${n.checklist.map((i) => `
      <li class="${i.isDone ? 'done' : ''}" data-item="${i.id}">
        <button class="check sm ${i.isDone ? 'on' : ''}" data-act="clToggle" aria-label="Tick">${CHECK}</button>
        <input type="text" id="cl-${i.id}" data-nf="item" value="${esc(i.text)}" aria-label="Checklist item">
        <button class="icon-btn" data-act="clRemove" title="Remove">${icon('x')}</button>
      </li>`).join('')}
    </ul>
    <div class="cl-add">${icon('plus')}<input id="clAdd" placeholder="Add an item and press Return" aria-label="New checklist item"></div>
  </div>`;
}

// ---------- Email summary ----------

const MAIL_RANGES = [[1, 'Last day'], [3, 'Last 3 days'], [7, 'Last week']];
const MAIL_LIMIT = 20;

function mailError(err) {
  const code = err?.code;
  if (err?.sample) {
    if (code === 'rate_limited') return "You've reached your Claude usage limit for now. Try again later.";
    if (code === 'session_expired') return 'Sign in to claude.ai again, then try again.';
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) return "Daybook isn't allowed to use Claude here, so it can't write the summary. Check this page's Permissions menu.";
    if (code === 'prompt_too_large') return 'Too much email to summarise at once. Try a shorter time range.';
    return "The summary didn't come back properly. Try again.";
  }
  switch (code) {
    case 'server_not_connected': case 'server_not_found': return "Gmail isn't connected. Add it in claude.ai Settings → Connectors, then try again.";
    case 'needs_reauth': return 'Gmail needs reconnecting. Open claude.ai Settings → Connectors and reconnect it.';
    case 'selection_required': return 'Choose which Gmail account to use when claude.ai asks, then try again.';
    case 'not_in_manifest': case 'approval_required': case 'consent_required': return 'Daybook needs your OK to read Gmail. Press the button again and choose Allow (or check this page\'s Permissions menu).';
    case 'blocked_by_policy': return "Your organisation doesn't let this page read Gmail.";
    case 'not_granted': case 'capability_disabled': case 'capability_removed': return "This view can't use your connectors. Open Daybook on claude.ai while signed in.";
    case 'server_unavailable': case 'rate_limited': return "Gmail didn't answer. Try again in a minute.";
    default: return "Couldn't read your email just now. Try again.";
  }
}

async function readMail() {
  const m = ui.mail;
  if (m.status === 'loading' || !HOST.mail) return;
  const step = (text) => { m.step = text; if (ui.view === 'mail') renderMain(); };
  Object.assign(m, { status: 'loading', error: '' });
  step('Finding recent email…');
  try {
    const found = await HOST.mail.search(`in:inbox newer_than:${m.days}d`, MAIL_LIMIT);
    const list = (Array.isArray(found?.threads) ? found.threads : []).slice(0, MAIL_LIMIT);
    if (!list.length) {
      Object.assign(m, { status: 'done', items: [], summary: null, at: new Date() });
      render();
      return;
    }
    step(`Reading ${list.length} email${list.length === 1 ? '' : 's'}…`);
    const full = new Array(list.length);
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        try { full[i] = (await HOST.mail.thread(list[i].id)) ?? list[i]; } catch { full[i] = list[i]; } // fall back to the preview
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const items = C.mailItems(full, new Date());
    step('Summarising…');
    const raw = await HOST.mail.ask(C.mailPrompt(items, new Date()));
    Object.assign(m, { status: 'done', items, summary: C.cleanMailSummary(raw, items, new Date()), at: new Date(), scroll: 0 });
  } catch (err) {
    console.error(err);
    Object.assign(m, { status: m.summary ? 'done' : 'error', error: mailError(err) });
    if (m.summary) toast(mailError(err));
  }
  render();
}

function addMailTask(i) {
  const m = ui.mail;
  const sug = m.summary?.tasks[i];
  if (!sug) return;
  const item = m.items.find((x) => x.ref === sug.ref);
  if (C.mailTaskAdded(data, sug, item)) return;
  const task = C.mailTask(sug, item);
  if (!change((d) => C.addTask(d, task))) return;
  const home = homeOf(task, P());
  toast(`Added to ${viewTitle(home)}${home === 'upcoming' && task.dueDay ? ' · ' + P().dayTitle(task.dueDay) : ''}`, { label: 'Show', run: () => revealTask(task.id) });
}

function mailItemHTML(item, line, extra = '') {
  if (!item) return '';
  return `<div class="mail-item">
    <div class="mi-body">
      <div class="mi-top"><span class="mi-subject">${item.unread ? '<i class="dot" title="Unread"></i>' : ''}${esc(item.subject)}</span>${extra}</div>
      <div class="mi-from">${esc(item.from)} · ${esc(fmtShort(C.noon(item.day)))}</div>
      ${line ? `<div class="mi-why">${esc(line)}</div>` : ''}
    </div>
    ${item.url ? `<a class="icon-btn" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" title="Open in Gmail">${icon('external')}</a>` : ''}
  </div>`;
}

function mailHTML() {
  const m = ui.mail;
  const range = MAIL_RANGES.find((r) => r[0] === m.days)?.[1] ?? 'Last 3 days';
  const busy = m.status === 'loading';
  const head = `<header class="head">
      <div><div class="eyebrow">Gmail · read only</div><h1>Email</h1></div>
      <div class="right"><div class="tools">
        <button class="tool" data-act="mailRange" title="How far back to read" ${busy ? 'disabled' : ''}>${icon('calendar')}${esc(range)}</button>
        <button class="tool primary" data-act="readMail" ${busy ? 'disabled' : ''}>${icon('mail')}${m.status === 'done' ? 'Refresh' : 'Read my email'}</button>
      </div></div>
    </header>`;
  if (busy) return head + `<div class="empty"><div><div class="big spin">${icon('mail')}</div><h2>${esc(m.step)}</h2><p>This takes about half a minute.</p></div></div>`;
  if (m.status === 'error') return head + `<div class="empty"><div><div class="big">${icon('alert')}</div><h2>Couldn't make the summary</h2><p>${esc(m.error)}</p>
    <p style="margin-top:14px"><button class="btn primary" data-act="readMail">Try again</button></p></div></div>`;
  if (m.status === 'idle') return head + `<div class="empty"><div><div class="big">${icon('mail')}</div><h2>Summarise your recent email</h2>
    <p>When you press the button, Daybook reads your Gmail inbox (${esc(range.toLowerCase())}), sorts out what needs a reply, deadlines and events, and what's safe to ignore, and suggests tasks you can add with one click.</p>
    <p style="margin-top:8px">It only reads. It can't send, delete or change any email, and nothing from your email is saved.</p>
    <p style="margin-top:14px"><button class="btn primary" data-act="readMail">Read my email</button></p></div></div>`;
  if (!m.items.length || !m.summary) return head + `<div class="empty"><div><div class="big">${icon('done')}</div><h2>No email in your inbox from the ${esc(range.toLowerCase())}</h2><p>Try a longer time range.</p></div></div>`;

  const s = m.summary;
  const byRef = new Map(m.items.map((i) => [i.ref, i]));
  const p = P();
  const when = m.at ? fmtTime(m.at) : '';
  const section = (title, count, inner, cls = '') => (count ? `<section class="group mail-group ${cls}"><h3>${esc(title)} <span class="count">${count}</span></h3>${inner}</section>` : '');
  const tasks = s.tasks.map((t, i) => {
    const item = byRef.get(t.ref);
    const added = C.mailTaskAdded(data, t, item);
    return `<li class="row sug ${added ? 'done' : ''}">
      <button class="check ${added ? 'on' : ''} ${t.important ? 'p2' : ''}" data-act="mailAdd" data-i="${i}" ${added ? 'disabled' : ''} title="${added ? 'Added' : 'Add this task'}" aria-label="${added ? 'Added' : 'Add this task'}">${added ? CHECK : `<svg viewBox="0 0 24 24" aria-hidden="true" class="plus-mark"><path d="M12 6v12M6 12h12"/></svg>`}</button>
      <div class="row-body">
        <div class="row-title"><span>${esc(t.title)}</span></div>
        <div class="row-meta"><span>${icon('calendar')}${t.day ? esc(p.dayTitle(t.day)) : 'No date (Inbox)'}</span>${t.important ? '<span>★ Important</span>' : ''}${item ? `<span>${icon('mail')}${esc(item.subject)}</span>` : ''}</div>
      </div>
      ${added ? '<span class="hint">Added</span>' : `<button class="btn small" data-act="mailAdd" data-i="${i}">Add</button>`}
    </li>`;
  }).join('');
  const open = s.tasks.filter((t) => !C.mailTaskAdded(data, t, byRef.get(t.ref))).length;

  return head + `<div class="scroll" id="mailScroll">
    <div class="card mail-overview">
      ${s.overview ? `<div>${esc(s.overview)}</div>` : ''}
      <div class="hint">Read ${m.items.length} email${m.items.length === 1 ? '' : 's'} from the ${esc(range.toLowerCase())} at ${esc(when)}. Written by Claude, so check anything important in Gmail.</div>
    </div>
    ${section('Suggested tasks', s.tasks.length, `<ul class="rows">${tasks}</ul>${open > 1 ? `<div style="padding:4px 12px"><button class="btn small" data-act="mailAddAll">Add all ${open}</button></div>` : ''}`)}
    ${section('Needs a reply', s.reply.length, s.reply.map((r) => mailItemHTML(byRef.get(r.ref), r.why, icon('reply'))).join(''))}
    ${section('Deadlines and events', s.dates.length, s.dates.map((d) => mailItemHTML(byRef.get(d.ref), d.what, `<span class="mi-day ${C.daysBetween(p.today, d.day) <= 1 ? 'soon' : ''}">${esc(p.dayTitle(d.day))}${d.time ? ' · ' + esc(d.time) : ''}</span>`)).join(''))}
    ${section('Other email', s.other.length, s.other.map((o) => mailItemHTML(byRef.get(o.ref), '')).join(''))}
    ${s.ignore.length ? `<details class="group mail-group" id="mailIgnore" ${ui.mail.ignoreOpen ? 'open' : ''}><summary><h3>Safe to ignore <span class="count">${s.ignore.length}</span></h3></summary>${s.ignore.map((x) => mailItemHTML(byRef.get(x.ref), x.why)).join('')}</details>` : ''}
  </div>`;
}

// ---------- Task editor ----------

function repeatChoice(r) {
  if (!r) return 'never';
  if (r.interval === 1 && ['day', 'week', 'month', 'year'].includes(r.unit)) return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[r.unit];
  return 'custom';
}

function renderInspector() {
  const el = $('#inspector');
  const t = ui.view !== 'notes' && !ui.search.trim() ? C.findTask(data, ui.taskId) : null;
  if (!t) { el.hidden = true; el.innerHTML = ''; return; }
  const p = P();
  el.hidden = false;
  const rc = repeatChoice(t.recurrence);
  const remPast = t.reminder != null && t.reminder < Date.now() / 1000 && !t.isCompleted;
  const denied = CAN_NOTIFY && Notification.permission === 'denied';
  el.innerHTML = `
    <div class="ins-top"><span>${t.isCompleted ? 'Completed task' : viewTitle(homeOf(t, p))}</span>
      <button class="icon-btn" data-act="closeEditor" title="Close (Esc)">${icon('x')}</button></div>
    <div class="form">
      <div class="card">
        <textarea class="field-title" id="fTitle" data-f="title" rows="1" placeholder="Title">${esc(t.title)}</textarea>
        <textarea class="field-notes" id="fNotes" data-f="details" placeholder="Add a description">${esc(t.details)}</textarea>
      </div>
      <div class="card">
        <label class="line"><span>★ Important</span><span class="switch"><input type="checkbox" data-f="isImportant" ${t.isImportant ? 'checked' : ''}><i></i></span></label>
        <div class="line"><span>Priority</span></div>
        <div class="seg">${C.PRIORITIES.map((name, i) => `<button data-act="prio" data-v="${i}" class="${t.priority === i ? 'on' : ''}">${name}</button>`).join('')}</div>
      </div>
      <div class="card">
        <h4>Day</h4>
        <label class="line"><span>Assign a day</span><span class="switch"><input type="checkbox" data-f="hasDay" ${t.dueDay ? 'checked' : ''}><i></i></span></label>
        ${t.dueDay ? `<label class="line"><span>Date</span><input type="date" data-f="dueDay" value="${t.dueDay}"></label>` : ''}
        <div class="chips">
          <button class="chip" data-act="day" data-v="today" ${t.isCompleted ? 'disabled' : ''}>Today</button>
          <button class="chip" data-act="day" data-v="tomorrow" ${t.isCompleted ? 'disabled' : ''}>Tomorrow</button>
          <button class="chip" data-act="day" data-v="nextweek" ${t.isCompleted ? 'disabled' : ''}>Next week</button>
          <button class="chip" data-act="day" data-v="none" ${t.isCompleted ? 'disabled' : ''}>No date</button>
        </div>
      </div>
      <div class="card">
        <h4>Reminder</h4>
        <label class="line"><span>Remind me</span><span class="switch"><input type="checkbox" data-f="hasReminder" ${t.reminder != null ? 'checked' : ''}><i></i></span></label>
        ${t.reminder != null ? `<label class="line"><span>At</span><input type="datetime-local" data-f="reminder" value="${toLocalInput(C.fromSec(t.reminder))}"></label>` : ''}
        ${remPast ? '<div class="hint warn">This time has passed. Pick a later time to be reminded.</div>' : ''}
        ${t.reminder != null && denied ? '<div class="hint warn">Notifications are blocked, so this reminder will only show inside Daybook.</div>' : ''}
        ${t.reminder != null && !denied ? `<div class="hint">${CAN_NOTIFY ? 'Reminders pop up while Daybook is open (it can be minimised).' : 'Reminders pop up inside Daybook, with a sound, while it is open.'}</div>` : ''}
      </div>
      <div class="card">
        <h4>Repeat</h4>
        <label class="line"><span>Repeats</span><select data-f="repeat">
          ${[['never', 'Never'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year'], ['custom', 'Custom…']]
            .map(([v, l]) => `<option value="${v}" ${rc === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        ${rc === 'custom' ? `<label class="line"><span>Every</span><span style="display:flex;gap:6px">
          <input type="number" min="1" max="365" data-f="interval" value="${t.recurrence.interval}">
          <select data-f="unit">${C.UNITS.map((u) => `<option value="${u}" ${t.recurrence.unit === u ? 'selected' : ''}>${u}${t.recurrence.interval === 1 ? '' : 's'}</option>`).join('')}</select>
        </span></label>` : ''}
        ${t.recurrence ? '<div class="hint">When you tick it off, it comes back on its next day.</div>' : ''}
      </div>
      <div class="card">
        ${t.isCompleted
          ? `<div class="line"><span>Completed</span><span class="hint">${t.completedAt ? esc(fmtFull(C.fromSec(t.completedAt))) : ''}</span></div>
             <button class="btn" data-act="restore">Restore to list</button>`
          : '<button class="btn primary" data-act="toggleSel">Mark as done</button>'}
        <div class="line"><span class="hint">Created ${esc(fmtFull(C.fromSec(t.createdAt)))}</span></div>
        <button class="btn danger" data-act="deleteSel">Delete task</button>
      </div>
    </div>`;
  autoGrow($('#fTitle'));
  autoGrow($('#fNotes'));
}

function refreshInspectorBits() {
  // Keep the editor in step without redrawing the text box being typed in.
  const t = C.findTask(data, ui.taskId);
  if (!t && !$('#inspector').hidden) renderInspector();
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ---------- Small window (widget-style) ----------

function renderCompact() {
  const p = P();
  const prog = p.progress(data.tasks);
  const open = p.widgetOrder(data.tasks);
  const shown = open.slice(0, 8);
  const done = p.doneTodayList(data.tasks).filter((t) => !t.isArchived).slice(0, Math.max(0, 8 - shown.length));
  const note = P().sortedNotes(data.notes).find((n) => n.isPinned);
  $('#compact').innerHTML = `
    <div class="chead">
      <div><div class="t1">${esc(fmtWeekday(ui.now))} ${esc(fmtDayMonth(ui.now))}</div><div class="t2">${esc(p.greeting(prefs.name))}</div></div>
      ${ringSVG(prog.done, prog.total, 34, 3.2)}
    </div>
    ${quickHTML('cquick', ui.compactText, 'today')}
    <div class="scroll">
      ${shown.length || done.length ? `<ul class="rows">${[...shown, ...done].map((t) => rowHTML(t, p)).join('')}</ul>` : `<div class="empty" style="padding:20px"><div><h2>${prog.done ? 'All done for today' : 'Nothing planned today'}</h2></div></div>`}
      ${open.length > shown.length ? `<div class="more">+${open.length - shown.length} more</div>` : ''}
    </div>
    ${note ? `<div class="note-card"><div class="nt">${icon('pin')}${esc(C.noteTitle(note))}</div>
      ${note.checklist.length ? `<ul>${note.checklist.slice(0, 4).map((i) => `<li data-note="${note.id}" data-item="${i.id}"><button class="check sm ${i.isDone ? 'on' : ''}" data-act="cnToggle">${CHECK}</button><span style="${i.isDone ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(i.text)}</span></li>`).join('')}</ul>`
        : `<div class="hint">${esc(C.notePreview(note).slice(0, 140))}</div>`}</div>` : ''}
    <div class="open-full">Make the window wider to see everything</div>`;
}

// ---------- Reminders ----------

function dueAlerts() {
  return data.tasks
    .filter((t) => !t.isCompleted && !t.isArchived && t.reminder != null && t.notifiedFor === t.reminder && t.reminderDismissed !== t.reminder)
    .sort((a, b) => a.reminder - b.reminder);
}

function renderAlerts() {
  const p = P();
  $('#alerts').innerHTML = dueAlerts().slice(0, 4).map((t) => `
    <div class="alert" data-id="${t.id}" role="alert">
      <div class="at">${icon('bell')}Reminder · ${esc(fmtReminder(t.reminder, p))}<button class="icon-btn x" data-act="alertDismiss" title="Dismiss">${icon('x')}</button></div>
      <div class="tt" data-act="revealTask" data-id="${t.id}">${t.isImportant ? '★ ' : ''}${esc(t.title)}</div>
      ${t.details.trim() ? `<div class="dd">${esc(t.details.trim().split('\n')[0])}</div>` : ''}
      <div class="acts">
        <button class="btn small primary" data-act="alertDone">Mark as done</button>
        ${C.SNOOZES.map((s) => `<button class="btn small" data-act="alertSnooze" data-v="${s.id}">${s.title}</button>`).join('')}
      </div>
    </div>`).join('');
}

function checkReminders() {
  if (readOnly || !store) return;
  const now = Date.now() / 1000;
  const due = data.tasks.filter((t) => !t.isCompleted && !t.isArchived && t.reminder != null && t.reminder <= now && t.notifiedFor !== t.reminder);
  if (!due.length) return;
  try {
    const { data: fresh } = store.mutate((d) => {
      for (const t of due) { const x = C.findTask(d, t.id); if (x && x.reminder === t.reminder) x.notifiedFor = x.reminder; }
    });
    data = fresh;
  } catch { return; }
  for (const t of due) if (now - t.reminder < 12 * 3600) systemNotify(t);
  render({ inspector: false });
  chime();
}

async function systemNotify(t) {
  if (!CAN_NOTIFY || Notification.permission !== 'granted') return;
  const title = (t.isImportant ? '★ ' : '') + t.title;
  const options = {
    body: t.details.trim() || 'Reminder',
    tag: 'daybook-' + t.id, // same task replaces, never duplicates
    icon: 'icons/icon-192.png',
    data: { id: t.id },
    actions: [{ action: 'done', title: 'Mark as Done' }, { action: 'fifteenMinutes', title: 'Snooze 15 min' }],
  };
  try {
    if (swReg?.showNotification) { await swReg.showNotification(title, options); return; }
  } catch { /* fall back */ }
  try {
    const { actions, ...plain } = options;
    const n = new Notification(title, plain);
    n.onclick = () => { window.focus(); revealTask(t.id); n.close(); };
  } catch { /* not allowed here */ }
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.55);
  } catch { /* no sound */ }
}

function handleNotificationAction(action, id) {
  if (!id || !C.findTask(data, id)) return;
  if (action === 'done') { change((d) => C.setCompleted(d, id, true)); toast('Marked as done'); }
  else if (C.SNOOZES.some((s) => s.id === action)) { snoozeTask(id, action); }
  else revealTask(id);
}

async function requestNotifications() {
  if (!CAN_NOTIFY) { toast('Reminders pop up inside Daybook while it is open.'); return; }
  try { await Notification.requestPermission(); } catch { /* ignore */ }
  render();
  renderSettings();
  renderWelcome();
}

function updateBadge() {
  const n = P().todayOpen(data.tasks).length;
  try {
    if (n && navigator.setAppBadge) navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch { /* not installed */ }
  document.title = n ? `Daybook (${n})` : 'Daybook';
}

// ---------- Actions ----------

function quickAdd(text, view) {
  const e = C.parseQuickEntry(text, new Date());
  if (!e) return false;
  const p = P();
  const task = C.newTask({
    title: e.title,
    isImportant: e.isImportant,
    reminder: e.reminder ? C.toSec(e.reminder) : null,
    dueDay: e.day ?? (view === 'today' ? p.today : view === 'upcoming' ? C.addDays(p.today, 1) : null),
  });
  if (!change((d) => C.addTask(d, task))) return false;
  const home = homeOf(task, P());
  const words = [`Added to ${viewTitle(home)}`];
  if (home === 'upcoming' && task.dueDay) words.push(P().dayTitle(task.dueDay));
  if (task.reminder) words.push('reminder ' + fmtReminder(task.reminder, P()));
  if (task.isImportant) words.push('important');
  toast(words.join(' · '));
  if (task.reminder && CAN_NOTIFY && Notification.permission === 'default') requestNotifications();
  return true;
}

function tick(id, rowEl) {
  const t = C.findTask(data, id);
  if (!t) return;
  if (!t.isCompleted && rowEl) {
    rowEl.classList.add('ticking');
    rowEl.querySelector('.check')?.classList.add('on');
    setTimeout(() => doToggle(id), 420);
  } else doToggle(id);
}
function doToggle(id) {
  const r = change((d) => C.toggleCompletion(d, id));
  if (r && r.repeated) toast(`Done · next one is ${P().dayTitle(r.repeated)}`);
}

function schedule(id, day) {
  change((d) => C.updateTask(d, id, (t) => {
    t.dueDay = day;
    if (t.reminder != null) {
      if (day) { const r = C.fromSec(t.reminder); t.reminder = C.toSec(C.atTime(day, r.getHours(), r.getMinutes())); }
      else t.reminder = null;
    }
  }));
}

function setReminder(id, date) {
  change((d) => C.updateTask(d, id, (t) => {
    t.reminder = date ? C.toSec(date) : null;
    if (date && !t.dueDay) t.dueDay = C.dayKey(date);
  }));
  if (date && CAN_NOTIFY && Notification.permission === 'default') requestNotifications();
}

function defaultReminder(t) {
  const today = P().today;
  const day = t.dueDay ?? today;
  if (day > today) return C.atTime(day, 9, 0);
  const hour = new Date().getHours() + 1;
  if (hour > 22) return C.atTime(C.addDays(today, 1), 9, 0);
  return C.atTime(day, Math.max(hour, 8), 0);
}

function nextMonday() {
  const today = P().today;
  const off = (1 - C.weekday(today) + 7) % 7;
  return C.addDays(today, off === 0 ? 7 : off);
}

function snoozeTask(id, option) {
  const until = C.snoozeUntil(option, new Date());
  change((d) => C.snooze(d, id, until));
  toast('Snoozed until ' + fmtReminder(C.toSec(until), P()));
}

function deleteTaskWithUndo(id) {
  const t = C.findTask(data, id);
  if (!t) return;
  if (ui.taskId === id) ui.taskId = null;
  change((d) => C.deleteTask(d, id));
  toast(`Deleted “${t.title}”`, { label: 'Undo', run: () => change((d) => { if (!C.findTask(d, t.id)) d.tasks.push(t); }) });
}

function deleteNoteWithUndo(id) {
  const n = C.findNote(data, id);
  if (!n) return;
  if (ui.noteId === id) ui.noteId = null;
  change((d) => C.deleteNote(d, id));
  toast(`Deleted “${C.noteTitle(n)}”`, { label: 'Undo', run: () => { change((d) => C.addNote(d, n)); ui.noteId = n.id; render(); } });
}

function newNoteAction() {
  const n = C.newNote();
  ui.search = '';
  ui.view = 'notes';
  ui.noteId = n.id;
  change((d) => C.addNote(d, n));
  setTimeout(() => $('#noteTitle')?.focus(), 0);
}

function revealTask(id) {
  const t = C.findTask(data, id);
  if (!t) return;
  ui.search = '';
  ui.view = homeOf(t);
  ui.taskId = id;
  render();
  setTimeout(() => $(`.row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }), 0);
}

function revealNote(id) {
  ui.search = '';
  ui.view = 'notes';
  ui.noteId = id;
  render();
}

function focusQuick() {
  ui.search = '';
  if (!takesEntry(ui.view)) ui.view = 'today';
  render();
  const el = matchMedia('(max-width: 560px)').matches ? $('#cquick') : $('#quick');
  el?.focus();
}

function setView(v) {
  ui.view = v;
  ui.search = '';
  ui.taskId = null;
  render();
}

async function exportBackup() {
  const name = `Daybook Backup ${P().today}.json`;
  if (HOST.saveFile) {
    try { await HOST.saveFile(name, JSON.stringify(data, null, 2)); toast('Backup saved'); }
    catch (err) { if (err?.code !== 'declined') toast(err?.message || "Couldn't save the backup."); }
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup downloaded');
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let fresh;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.notes))) throw new Error();
      fresh = C.cleanData(parsed);
    } catch {
      toast("That file isn't a Daybook backup.");
      return;
    }
    const ok = await confirmBox('Replace everything with this backup?',
      `It has ${fresh.tasks.length} tasks and ${fresh.notes.length} notes. What's in Daybook now is kept as a backup copy.`, 'Replace');
    if (!ok) return;
    if (readOnly || !store) { toast("Daybook can't save right now."); return; }
    try { store.save(fresh); data = fresh; ui.taskId = null; ui.noteId = null; render(); toast('Backup restored'); }
    catch (err) { toast(err.message || "Couldn't restore."); }
  };
  input.click();
}

// ---------- Menus ----------

function openMenu(x, y, items) {
  const menu = $('#menu');
  menu.innerHTML = items.map((it) => {
    if (it === '-') return '<hr>';
    if (it.label) return `<div class="label">${esc(it.label)}</div>`;
    return `<button data-mi="${items.indexOf(it)}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}><span>${it.checked ? '✓ ' : ''}${esc(it.title)}</span>${it.key ? `<span class="k">${esc(it.key)}</span>` : ''}</button>`;
  }).join('');
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  menu.onclick = (e) => {
    const b = e.target.closest('[data-mi]');
    if (!b) return;
    closeMenu();
    items[+b.dataset.mi].run?.();
  };
}
function closeMenu() { $('#menu').hidden = true; }

function taskMenu(t, x, y) {
  const today = P().today;
  const items = [
    { title: t.isCompleted ? 'Mark as not done' : 'Mark as done', key: 'Space', run: () => doToggle(t.id) },
    { title: 'Edit…', key: '↩', run: () => { ui.taskId = t.id; render(); } },
    '-',
    { title: t.isImportant ? 'Remove important' : 'Mark as important', key: 'I', run: () => change((d) => C.updateTask(d, t.id, (x2) => { x2.isImportant = !x2.isImportant; })) },
    { label: 'Priority' },
    ...C.PRIORITIES.map((name, i) => ({ title: name, checked: t.priority === i, run: () => change((d) => C.updateTask(d, t.id, (x2) => { x2.priority = i; })) })),
  ];
  if (!t.isCompleted) {
    items.push('-', { label: 'Move to' },
      { title: 'Today', run: () => schedule(t.id, today) },
      { title: 'Tomorrow', run: () => schedule(t.id, C.addDays(today, 1)) },
      { title: 'Next week', run: () => schedule(t.id, nextMonday()) },
      { title: 'Inbox (no date)', run: () => schedule(t.id, null) },
      '-', { label: 'Remind me' },
      { title: 'In 1 hour', run: () => setReminder(t.id, new Date(Date.now() + 3600e3)) });
    if (Date.now() < C.atTime(today, 18, 0).getTime()) items.push({ title: 'This evening (6 pm)', run: () => setReminder(t.id, C.atTime(today, 18, 0)) });
    items.push({ title: 'Tomorrow morning (8 am)', run: () => setReminder(t.id, C.atTime(C.addDays(today, 1), 8, 0)) });
    if (t.reminder != null) items.push({ title: 'Remove reminder', run: () => setReminder(t.id, null) });
  }
  items.push('-', { title: 'Delete', key: '⌫', danger: true, run: () => deleteTaskWithUndo(t.id) });
  openMenu(x, y, items);
}

// ---------- Dialogs ----------

function confirmBox(title, text, okLabel = 'OK') {
  const dlg = $('#confirm');
  dlg.innerHTML = `<form method="dialog" class="sheet-in"><h2 style="font-size:16px">${esc(title)}</h2><div class="hint" style="font-size:13px">${esc(text)}</div>
    <div class="sheet-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok" autofocus>${esc(okLabel)}</button></div></form>`;
  dlg.showModal();
  return new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue === 'ok'); });
}

function notifStatus() {
  if (!CAN_NOTIFY) return 'unsupported';
  return Notification.permission; // granted | denied | default
}

function installSteps() {
  if (HOST.installText) return HOST.installText;
  const ua = navigator.userAgent;
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return '<p>Daybook is installed. Open it from your Dock or Launchpad.</p>';
  if (safari) return '<p>In Safari, choose <b>File → Add to Dock</b>, then click <b>Add</b>. Use Daybook from the Dock from now on: the Dock app keeps its own saved data, separate from Safari tabs.</p>';
  return `<p>${installPrompt ? 'Click <b>Install Daybook</b> below, or c' : 'C'}lick the install icon at the right end of the address bar (a screen with a down arrow), or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b>. Daybook then opens in its own window and appears in your Dock and Launchpad.</p>`;
}

function renderWelcome() {
  const dlg = $('#welcome');
  if (!dlg.open) return;
  const st = notifStatus();
  dlg.innerHTML = `<div class="sheet-in">
    <div style="display:flex;gap:12px;align-items:center"><img src="icons/icon-192.png" width="52" height="52" alt="">
      <div><h2>Welcome to Daybook</h2><div class="hint" style="font-size:13px">Write it down, tick it off.</div></div></div>
    <input class="text-input" id="wName" placeholder="Your first name (for the greeting, optional)" value="${esc(prefs.name)}">
    <div class="step"><span class="n">1</span><div><b>Install it as an app</b>${installSteps()}
      ${installPrompt ? '<button class="btn primary small" data-act="install">Install Daybook</button>' : ''}</div></div>
    <div class="step"><span class="n">2</span><div><b>Add tasks fast</b><p>Type in the box at the top and press Return. Add words like “tomorrow 3pm” or “friday”, or end with “!” to mark it important. Press <b>N</b> any time to jump there.</p></div></div>
    <div class="step"><span class="n">3</span><div><b>Allow notifications</b><p>So reminders pop up while Daybook is open, even minimised or behind other windows.</p>
      <div style="margin-top:8px">${st === 'granted' ? '✓ Notifications are on' : st === 'denied' ? '<span class="hint">Notifications are blocked. You can allow them in the browser\'s site settings.</span>' : st === 'unsupported' ? '<span class="hint">This browser can\'t show notifications. Reminders will show inside Daybook.</span>' : '<button class="btn primary small" data-act="allowNotif">Allow notifications</button>'}</div></div></div>
    <div class="step"><span class="n">4</span><div><b>Use it like a widget</b><p>Make the window narrow and it turns into a compact Today view. Keep it in a corner of your screen.</p></div></div>
    <div class="sheet-actions"><button class="btn primary" data-act="finishWelcome">Start using Daybook</button></div>
  </div>`;
}

function openWelcome() {
  const dlg = $('#welcome');
  if (!dlg.open) dlg.showModal();
  renderWelcome();
}

function renderSettings() {
  const dlg = $('#settings');
  if (!dlg.open) return;
  const st = notifStatus();
  const tab = ui.settingsTab;
  const tabs = [['general', 'General'], ['notifications', 'Notifications'], ['data', 'Data'], ['shortcuts', 'Shortcuts']];
  let body = '';
  if (tab === 'general') {
    body = `<label class="line"><span>Your name</span><input class="text-input" style="width:220px" id="sName" placeholder="Shown in the greeting" value="${esc(prefs.name)}"></label>
      <label class="line"><span>Appearance</span><select id="sTheme">${[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${prefs.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div><b>Install</b>${installSteps()}${installPrompt ? '<button class="btn small primary" data-act="install">Install Daybook</button>' : ''}</div>
      <div class="hint">Open at login: in Chrome, open Daybook, click ⋮ in its title bar → <b>App info</b> (or visit chrome://apps, right-click Daybook) and turn on <b>Start app when you sign in</b>.</div>`;
  } else if (tab === 'notifications') {
    body = `<div class="line"><span>Status</span><b>${{ granted: 'Allowed', denied: 'Blocked', default: 'Not asked yet', unsupported: 'Not available in this browser' }[st]}</b></div>
      ${st === 'default' ? '<button class="btn primary" data-act="allowNotif">Allow notifications</button>' : ''}
      ${st === 'denied' ? '<div class="hint">Allow notifications for this site in the browser: click the icon at the left of the address bar → Site settings → Notifications → Allow.</div>' : ''}
      ${st === 'granted' ? '<button class="btn" data-act="testNotif">Send a test notification</button>' : ''}
      <div class="hint">Reminders pop up while Daybook is open, even when it's minimised or behind other windows. Each one shows inside Daybook too, with Mark as done and Snooze (5 min, 15 min, 1 hour, later today). A web app can't send reminders after it's fully closed, so keep it open.</div>`;
  } else if (tab === 'data') {
    body = `<div class="hint">Everything saves on this computer as soon as you change it. The previous version is kept as a backup copy. Clearing this site's data in the browser would delete it, so download a backup now and then.</div>
      <div class="line"><span>Tasks · Notes</span><b>${data.tasks.length} · ${data.notes.length}</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="export">${icon('download')} Download backup</button>
        <button class="btn" data-act="import">Restore from backup…</button>
        <button class="btn" data-act="archiveAll">Archive completed tasks</button>
      </div>
      <div class="hint">Backups use the same format as the Daybook Mac app, so you can move to it later.</div>
      ${startupError ? `<div class="hint warn">${esc(startupError)}</div>` : ''}`;
  } else {
    body = `<div class="kbd-list">
      <span>New task</span><span>N</span><span>New note</span><span>Shift N</span>
      <span>Search</span><span>/ or ⌘F</span><span>${esc(shownViews().map((v) => v.title).join(' · '))}</span><span>1 – ${shownViews().length}</span>
      <span>Mark selected done</span><span>Space</span><span>Mark selected important</span><span>I</span>
      <span>Edit selected</span><span>Return</span><span>Delete selected</span><span>Delete</span>
      <span>Move selection</span><span>↑ ↓</span><span>Close editor or search</span><span>Esc</span></div>`;
  }
  dlg.innerHTML = `<div class="tabs">${tabs.map(([v, l]) => `<button data-act="stab" data-v="${v}" class="${tab === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="sheet-in">${body}<div class="sheet-actions"><button class="btn primary" data-act="closeSettings">Done</button></div></div>`;
}

function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'system') {
    // Only undo a theme Daybook set itself; a host may set its own.
    if (root.dataset.daybookTheme) { root.removeAttribute('data-theme'); delete root.dataset.daybookTheme; }
  } else {
    root.setAttribute('data-theme', prefs.theme);
    root.dataset.daybookTheme = '1';
  }
}

// ---------- Toast ----------

let toastTimer;
function toast(text, action) {
  const el = $('#toast');
  el.innerHTML = esc(text) + (action ? ` <button class="btn small" style="margin-left:8px;pointer-events:auto" id="toastAct">${esc(action.label)}</button>` : '');
  el.style.pointerEvents = action ? 'auto' : 'none';
  el.classList.add('show');
  if (action) $('#toastAct').onclick = () => { el.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// ---------- Events ----------

const ACTIONS = {
  view: (b) => setView(b.dataset.v),
  settings: () => { const d = $('#settings'); d.showModal(); renderSettings(); },
  closeSettings: () => $('#settings').close(),
  stab: (b) => { ui.settingsTab = b.dataset.v; renderSettings(); },
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch { /* ignore */ }
    installPrompt = null;
    render(); renderSettings(); renderWelcome();
  },
  allowNotif: () => requestNotifications(),
  testNotif: () => { systemNotify({ id: 'test', title: 'Daybook', details: 'Notifications are working. Reminders will look like this.', isImportant: false }); },
  export: () => exportBackup(),
  import: () => importBackup(),
  archiveAll: () => { const n = change((d) => C.archiveCompleted(d)) ?? 0; toast(n ? `Archived ${n} completed task${n === 1 ? '' : 's'}` : 'Nothing to archive'); renderSettings(); },
  finishWelcome: () => {
    prefs.name = ($('#wName')?.value ?? '').trim();
    prefs.onboarded = true;
    savePrefs();
    $('#welcome').close();
    focusQuick();
  },
  toggle: (b) => { const row = b.closest('.row'); tick(row.dataset.id, row); },
  toggleSel: () => ui.taskId && doToggle(ui.taskId),
  restore: () => ui.taskId && change((d) => C.setCompleted(d, ui.taskId, false)),
  deleteSel: () => ui.taskId && deleteTaskWithUndo(ui.taskId),
  closeEditor: () => { ui.taskId = null; render(); },
  prio: (b) => change((d) => C.updateTask(d, ui.taskId, (t) => { t.priority = +b.dataset.v; })),
  day: (b) => {
    const today = P().today;
    const v = b.dataset.v;
    schedule(ui.taskId, v === 'today' ? today : v === 'tomorrow' ? C.addDays(today, 1) : v === 'nextweek' ? nextMonday() : null);
  },
  importantOnly: () => { ui.importantOnly = !ui.importantOnly; render(); },
  showArchived: () => { ui.showArchived = !ui.showArchived; render(); },
  sortMenu: (b) => {
    const r = b.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [{ label: 'Sort by' }, ...SORTS.map(([v, l]) => ({ title: l, checked: prefs.sort === v, run: () => { prefs.sort = v; savePrefs(); render(); } }))]);
  },
  clearMenu: (b) => {
    const r = b.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { title: 'Archive all completed', run: () => ACTIONS.archiveAll() },
      { title: 'Delete archived permanently…', danger: true, run: async () => {
        if (await confirmBox('Delete all archived tasks?', "This can't be undone.", 'Delete')) {
          const n = change((d) => C.deleteArchived(d)) ?? 0;
          toast(`Deleted ${n} archived task${n === 1 ? '' : 's'}`);
        }
      } },
    ]);
  },
  revealTask: (b) => revealTask(b.dataset.id ?? b.closest('[data-id]')?.dataset.id),
  revealNote: (b) => revealNote(b.dataset.id),
  newNote: () => newNoteAction(),
  selectNote: (b) => { ui.noteId = b.dataset.id; render(); },
  pinNote: () => change((d) => C.updateNote(d, ui.noteId, (n) => { n.isPinned = !n.isPinned; })),
  deleteNote: () => deleteNoteWithUndo(ui.noteId),
  clToggle: (b) => { const id = b.closest('[data-item]').dataset.item; change((d) => C.updateNote(d, ui.noteId, (n) => { const i = n.checklist.find((x) => x.id === id); if (i) i.isDone = !i.isDone; })); },
  clRemove: (b) => { const id = b.closest('[data-item]').dataset.item; change((d) => C.updateNote(d, ui.noteId, (n) => { n.checklist = n.checklist.filter((x) => x.id !== id); })); },
  clClear: () => change((d) => C.updateNote(d, ui.noteId, (n) => { n.checklist = n.checklist.filter((x) => !x.isDone); })),
  cnToggle: (b) => { const li = b.closest('[data-item]'); change((d) => C.updateNote(d, li.dataset.note, (n) => { const i = n.checklist.find((x) => x.id === li.dataset.item); if (i) i.isDone = !i.isDone; })); },
  alertDone: (b) => { const id = b.closest('.alert').dataset.id; change((d) => C.setCompleted(d, id, true)); toast('Marked as done'); },
  alertSnooze: (b) => snoozeTask(b.closest('.alert').dataset.id, b.dataset.v),
  readMail: () => readMail(),
  mailRange: (b) => {
    const r = b.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [{ label: 'Read email from' }, ...MAIL_RANGES.map(([d, l]) => ({ title: l, checked: ui.mail.days === d, run: () => { ui.mail.days = d; renderMain(); } }))]);
  },
  mailAdd: (b) => addMailTask(+b.dataset.i),
  mailAddAll: () => {
    const s = ui.mail.summary;
    if (!s) return;
    const fresh = s.tasks.map((t) => ({ t, item: ui.mail.items.find((x) => x.ref === t.ref) })).filter(({ t, item }) => !C.mailTaskAdded(data, t, item));
    if (!fresh.length) return;
    change((d) => { for (const { t, item } of fresh) C.addTask(d, C.mailTask(t, item)); });
    toast(`Added ${fresh.length} tasks`);
  },
  alertDismiss: (b) => { const id = b.closest('.alert').dataset.id; change((d) => C.updateTask(d, id, (t) => { t.reminderDismissed = t.reminder; })); },
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu')) closeMenu();
  const actEl = e.target.closest('[data-act]');
  if (actEl && !actEl.disabled) {
    e.preventDefault();
    ACTIONS[actEl.dataset.act]?.(actEl, e);
    return;
  }
  const row = e.target.closest('#main .row');
  if (row && row.dataset.id) {
    ui.taskId = row.dataset.id;
    render();
  }
});

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row');
  if (row?.dataset.id) {
    e.preventDefault();
    const t = C.findTask(data, row.dataset.id);
    if (t) { ui.taskId = t.id; render(); taskMenu(t, e.clientX, e.clientY); }
    return;
  }
  const li = e.target.closest('.cl [data-item]');
  if (li) {
    e.preventDefault();
    const n = C.findNote(data, ui.noteId);
    const idx = n?.checklist.findIndex((x) => x.id === li.dataset.item) ?? -1;
    if (idx < 0) return;
    const item = n.checklist[idx];
    const move = (by) => change((d) => C.updateNote(d, n.id, (x) => {
      const j = idx + by;
      if (j >= 0 && j < x.checklist.length) [x.checklist[idx], x.checklist[j]] = [x.checklist[j], x.checklist[idx]];
    }));
    openMenu(e.clientX, e.clientY, [
      { title: 'Make a task for today', run: () => { if (item.text.trim() && change((d) => C.addTask(d, C.newTask({ title: item.text, dueDay: P().today })))) toast(`Added “${item.text.trim()}” to Today`); } },
      '-',
      { title: 'Move up', disabled: idx === 0, run: () => move(-1) },
      { title: 'Move down', disabled: idx === n.checklist.length - 1, run: () => move(1) },
      '-',
      { title: 'Remove', danger: true, run: () => change((d) => C.updateNote(d, n.id, (x) => { x.checklist = x.checklist.filter((c) => c.id !== item.id); })) },
    ]);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-quick]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const compact = input.id === 'cquick';
  if (quickAdd(input.value, form.dataset.quick)) {
    if (compact) ui.compactText = ''; else ui.quickText = '';
    render();
    (compact ? $('#cquick') : $('#quick'))?.focus();
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'quick' || el.id === 'cquick') {
    if (el.id === 'quick') ui.quickText = el.value; else ui.compactText = el.value;
    const hint = document.getElementById(el.id + '-hint');
    if (hint) hint.textContent = quickHint(el.value);
    el.parentElement.querySelector('kbd')?.classList.toggle('hidden', !el.value);
    return;
  }
  if (el.id === 'search') {
    ui.search = el.value;
    if (ui.search.trim()) ui.taskId = null;
    keepFocus(() => { renderMain(); renderSidebar(); });
    renderInspector();
    return;
  }
  if (el.id === 'sName') { prefs.name = el.value.trim(); savePrefs(); keepFocus(() => { renderSidebar(); renderCompact(); }); return; }
  // Task editor text: save as you type, without redrawing the editor.
  if (el.dataset.f === 'title' || el.dataset.f === 'details') {
    autoGrow(el);
    const key = el.dataset.f;
    const value = el.value;
    if (key === 'title' && !value.trim()) return; // never save an empty title
    change((d) => C.updateTask(d, ui.taskId, (t) => { t[key] = value; }), { inspector: false });
    return;
  }
  // Note text.
  if (el.dataset.nf) {
    const value = el.value;
    if (el.dataset.nf === 'item') {
      const id = el.closest('[data-item]').dataset.item;
      saveNote((n) => { const i = n.checklist.find((x) => x.id === id); if (i) i.text = value; });
    } else {
      const key = el.dataset.nf;
      saveNote((n) => { n[key] = value; });
    }
  }
});

function saveNote(fn) {
  if (readOnly || !store) { toast(startupError ?? "Daybook can't save right now."); return; }
  try {
    const { data: fresh } = store.mutate((d) => C.updateNote(d, ui.noteId, fn));
    data = fresh;
    const list = $('#noteList');
    if (list) list.innerHTML = noteListHTML();
    const n = C.findNote(data, ui.noteId);
    const edited = $('#noteEdited');
    if (n && edited) edited.textContent = 'Edited ' + fmtFull(C.fromSec(n.modifiedAt));
    renderCompact();
    renderAlerts();
  } catch (err) { toast(err.message || "Couldn't save."); }
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'sTheme') { prefs.theme = el.value; savePrefs(); applyTheme(); return; }
  const f = el.dataset.f;
  if (!f || !ui.taskId) return;
  const id = ui.taskId;
  switch (f) {
    case 'title':
      if (!el.value.trim()) { el.value = C.findTask(data, id)?.title ?? ''; autoGrow(el); }
      render();
      break;
    case 'isImportant': change((d) => C.updateTask(d, id, (t) => { t.isImportant = el.checked; })); break;
    case 'hasDay': {
      const t = C.findTask(data, id);
      schedule(id, el.checked ? (t.reminder != null ? C.dayKey(C.fromSec(t.reminder)) : P().today) : null);
      break;
    }
    case 'dueDay': if (C.isDayKey(el.value)) schedule(id, el.value); break;
    case 'hasReminder': setReminder(id, el.checked ? defaultReminder(C.findTask(data, id)) : null); break;
    case 'reminder': { const d = fromLocalInput(el.value); if (d) setReminder(id, d); break; }
    case 'repeat': {
      const v = el.value;
      change((d) => C.updateTask(d, id, (t) => {
        const map = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
        if (v === 'never') t.recurrence = null;
        else if (v === 'custom') t.recurrence = repeatChoice(t.recurrence) === 'custom' ? t.recurrence : { unit: 'day', interval: 2 };
        else t.recurrence = { unit: map[v], interval: 1 };
        if (t.recurrence && !t.dueDay) t.dueDay = t.reminder != null ? C.dayKey(C.fromSec(t.reminder)) : P().today;
      }));
      break;
    }
    case 'interval': change((d) => C.updateTask(d, id, (t) => { if (t.recurrence) t.recurrence.interval = Math.max(1, Math.min(365, Math.floor(+el.value || 1))); })); break;
    case 'unit': change((d) => C.updateTask(d, id, (t) => { if (t.recurrence && C.UNITS.includes(el.value)) t.recurrence.unit = el.value; })); break;
    default: break;
  }
});

document.addEventListener('keydown', (e) => {
  const el = e.target;
  const typing = el.matches?.('input, textarea, select, [contenteditable]');

  if (el.id === 'clAdd' && e.key === 'Enter') {
    e.preventDefault();
    const text = el.value.trim();
    if (!text) return;
    change((d) => C.updateNote(d, ui.noteId, (n) => { n.checklist.push({ id: C.uuid(), text, isDone: false }); }));
    $('#clAdd')?.focus();
    return;
  }
  if (el.dataset?.nf === 'item' && e.key === 'Enter') { e.preventDefault(); $('#clAdd')?.focus(); return; }
  if (el.dataset?.f === 'title' && e.key === 'Enter') { e.preventDefault(); el.blur(); return; }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search')?.focus(); $('#search')?.select(); return; }

  if (e.key === 'Escape') {
    if (!$('#menu').hidden) { closeMenu(); return; }
    if ($('dialog[open]')) return; // the dialog closes itself
    if (typing) {
      if (el.id === 'search' && ui.search) { ui.search = ''; render(); return; }
      el.blur();
      return;
    }
    if (ui.search) { ui.search = ''; render(); return; }
    if (ui.taskId) { ui.taskId = null; render(); }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || $('dialog[open]')) return;

  const k = e.key;
  if (k === '/' ) { e.preventDefault(); $('#search')?.focus(); return; }
  if (k === 'n') { e.preventDefault(); focusQuick(); return; }
  if (k === 'N') { e.preventDefault(); newNoteAction(); return; }
  const v = shownViews().find((x) => x.key === k);
  if (v) { e.preventDefault(); setView(v.id); return; }

  const sel = C.findTask(data, ui.taskId);
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const ids = $$('#main .row[data-id]').map((r) => r.dataset.id);
    if (!ids.length) return;
    e.preventDefault();
    const i = ids.indexOf(ui.taskId);
    ui.taskId = ids[k === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)];
    render();
    $(`.row[data-id="${ui.taskId}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!sel) return;
  if (k === ' ') { e.preventDefault(); tick(sel.id, $(`#main .row[data-id="${sel.id}"]`)); return; }
  if (k === 'i' || k === 'I') { e.preventDefault(); change((d) => C.updateTask(d, sel.id, (t) => { t.isImportant = !t.isImportant; })); return; }
  if (k === 'Enter') { e.preventDefault(); $('#fTitle')?.focus(); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteTaskWithUndo(sel.id); }
});

// Remember whether "Safe to ignore" is open across redraws.
document.addEventListener('toggle', (e) => { if (e.target.id === 'mailIgnore') ui.mail.ignoreOpen = e.target.open; }, true);

// Drag to reorder (when sorted Manually).
let dragId = null;
document.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.row[draggable="true"]');
  if (!row) return;
  dragId = row.dataset.id;
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragover', (e) => {
  const row = e.target.closest?.('.row');
  if (!dragId || !row) return;
  const from = $(`.row[data-id="${dragId}"]`)?.closest('.rows');
  if (row.closest('.rows') !== from || row.dataset.id === dragId) return;
  e.preventDefault();
  $$('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  const r = row.getBoundingClientRect();
  row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
});
document.addEventListener('drop', (e) => {
  const row = e.target.closest?.('.row');
  if (!dragId || !row) return;
  e.preventDefault();
  const list = row.closest('.rows');
  const ids = $$('.row', list).map((r) => r.dataset.id).filter((id) => id !== dragId);
  let at = ids.indexOf(row.dataset.id);
  if (row.classList.contains('drop-after')) at += 1;
  ids.splice(Math.max(0, at), 0, dragId);
  dragId = null;
  change((d) => C.reorder(d, ids));
});
document.addEventListener('dragend', () => {
  dragId = null;
  $$('.dragging, .drop-before, .drop-after').forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
});

// Another Daybook window, tab or device saved something.
function reloadFromHost() {
  if (!store) return;
  try {
    Object.assign(prefs, loadPrefs());
    applyTheme();
    data = store.load();
    render({ inspector: !document.activeElement?.dataset?.f });
    if (prefs.onboarded && $('#welcome').open) $('#welcome').close();
  } catch { /* keep what we have */ }
}
HOST.onChange?.(reloadFromHost);
HOST.onStatus?.(() => keepFocus(renderSidebar));

window.addEventListener('storage', (e) => {
  if (!store || e.key !== store.key) return;
  try { data = store.load(); render({ inspector: !document.activeElement?.dataset?.f }); } catch { /* keep what we have */ }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) { render({ inspector: false }); checkReminders(); } });

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderSidebar(); renderSettings(); renderWelcome();
});
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Daybook is installed'); renderSidebar(); });

// ---------- Start ----------

applyTheme();
render();

let lastMinute = new Date().getMinutes();
setInterval(() => {
  checkReminders();
  const m = new Date().getMinutes();
  if (m !== lastMinute) { lastMinute = m; render({ inspector: false }); }
}, 10000);
setTimeout(checkReminders, 500);

if ('serviceWorker' in navigator && !HOST.noServiceWorker) {
  navigator.serviceWorker.register('sw.js').then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.ready.then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'notification') handleNotificationAction(e.data.action, e.data.id);
  });
}

// Opened from a notification button while Daybook was closed.
const params = new URLSearchParams(location.search);
if (params.get('id')) {
  handleNotificationAction(params.get('act') || 'open', params.get('id'));
  history.replaceState(null, '', location.pathname);
}

if (params.get('new') === 'task') { history.replaceState(null, '', location.pathname); setTimeout(focusQuick, 0); }

if (startupError) toast(startupError);
if (!prefs.onboarded) openWelcome();
