// Tests for the Daybook web app's logic (daybook/core.js). Same cases as the macOS app's Swift tests.
process.env.TZ = 'Australia/Sydney';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../daybook/core.js';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test('days: keys, adding across daylight saving and month ends', () => {
  assert.equal(C.dayKey(at(2026, 11, 13)), '2026-11-13');
  assert.equal(C.addDays('2026-10-03', 1), '2026-10-04'); // Sydney clocks go forward 4 Oct
  assert.equal(C.addDays('2026-10-03', 2), '2026-10-05');
  assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(C.daysBetween('2026-11-13', '2026-11-20'), 7);
});

test('add puts new tasks first, rejects duplicates and blanks', () => {
  const data = C.emptyData();
  const a = C.newTask({ title: 'Finish legal studies notes' });
  const b = C.newTask({ title: 'Pack running shoes' });
  assert.ok(C.addTask(data, a));
  assert.ok(C.addTask(data, b));
  assert.equal(C.addTask(data, a), false);
  assert.equal(C.addTask(data, C.newTask({ title: '   ' })), false);
  assert.deepEqual(C.planner().sorted(data.tasks, 'manual').map((t) => t.title), ['Pack running shoes', 'Finish legal studies notes']);
});

test('completing is safe to repeat; restore un-archives', () => {
  const data = C.emptyData();
  const t = C.newTask({ title: 'Email teacher' });
  C.addTask(data, t);
  const now = at(2026, 11, 13, 9);
  assert.equal(C.setCompleted(data, t.id, true, now), 'completed');
  const first = C.findTask(data, t.id).completedAt;
  assert.equal(C.setCompleted(data, t.id, true, at(2026, 11, 13, 10)), 'completed');
  assert.equal(C.findTask(data, t.id).completedAt, first);
  C.archiveCompleted(data, now);
  assert.equal(C.findTask(data, t.id).isArchived, true);
  C.setCompleted(data, t.id, false, now);
  const r = C.findTask(data, t.id);
  assert.equal(r.isCompleted, false);
  assert.equal(r.isArchived, false);
  assert.equal(r.completedAt, null);
});

test('repeating task keeps a done copy and moves past today', () => {
  const data = C.emptyData();
  const t = C.newTask({ title: 'Stretch', dueDay: '2026-11-09', recurrence: { unit: 'day', interval: 1 }, reminder: C.toSec(at(2026, 11, 9, 7, 30)) });
  C.addTask(data, t);
  const now = at(2026, 11, 13, 10);
  assert.deepEqual(C.toggleCompletion(data, t.id, now), { repeated: '2026-11-14' });
  const moved = C.findTask(data, t.id);
  assert.equal(moved.isCompleted, false);
  assert.equal(moved.dueDay, '2026-11-14');
  const r = C.fromSec(moved.reminder);
  assert.deepEqual([r.getDate(), r.getHours(), r.getMinutes()], [14, 7, 30]);
  const record = data.tasks.find((x) => x.seriesID === t.id);
  assert.equal(record.isCompleted, true);
  assert.equal(record.recurrence, null);
  assert.ok(C.planner(now).doneToday(record));
  assert.equal(C.nextRepeat({ unit: 'week', interval: 2 }, '2026-11-13'), '2026-11-27');
  assert.equal(C.repeatSummary({ unit: 'week', interval: 2 }), 'Every 2 weeks');
});

test('reorder keeps other tasks in place', () => {
  const data = C.emptyData();
  const [a, b, c] = ['A', 'B', 'C'].map((title) => C.newTask({ title }));
  C.addTask(data, a); C.addTask(data, b); C.addTask(data, c);
  C.reorder(data, [a.id, c.id]);
  assert.deepEqual(C.planner().sorted(data.tasks, 'manual').map((t) => t.title), ['A', 'B', 'C']);
});

test('lists: today, upcoming, inbox, progress, groups', () => {
  const now = at(2026, 11, 13, 10);
  const p = C.planner(now);
  const all = [
    C.newTask({ title: 'Overdue', dueDay: '2026-11-11' }),
    C.newTask({ title: 'Today', dueDay: '2026-11-13' }),
    C.newTask({ title: 'Future', dueDay: '2026-11-16' }),
    C.newTask({ title: 'Inbox' }),
    C.newTask({ title: 'Important', isImportant: true }),
    C.newTask({ title: 'Reminder tomorrow', reminder: C.toSec(at(2026, 11, 14, 9)) }),
    C.newTask({ title: 'Done', dueDay: '2026-11-13', isCompleted: true, completedAt: C.toSec(now) }),
  ];
  assert.deepEqual(new Set(p.todayOpen(all).map((t) => t.title)), new Set(['Overdue', 'Today', 'Important']));
  assert.deepEqual(new Set(all.filter(p.upcoming).map((t) => t.title)), new Set(['Future', 'Reminder tomorrow']));
  assert.deepEqual(new Set(all.filter(p.inbox).map((t) => t.title)), new Set(['Inbox', 'Important']));
  assert.deepEqual(p.progress(all), { done: 1, total: 4 });
  assert.deepEqual(p.todayGroups(all, 'manual').map((g) => g.id), ['overdue', 'today', 'done']);
  assert.equal(p.widgetOrder(all)[0].title, 'Overdue');
  assert.equal(p.upcomingGroups(all, 'manual')[0].title, 'Tomorrow');
  assert.equal(p.greeting('Axel'), 'Good morning, Axel');
});

test('search ignores case and accents, finds archived tasks and checklist items', () => {
  const data = C.emptyData();
  C.addTask(data, C.newTask({ title: 'Email teacher about essay' }));
  C.addTask(data, C.newTask({ title: 'Café booking', isCompleted: true, isArchived: true }));
  C.addNote(data, C.newNote({ title: 'Packing', checklist: [{ id: 'x', text: 'Sailing gloves', isDone: false }] }));
  const p = C.planner();
  assert.equal(p.search('EMAIL essay', data).tasks.length, 1);
  assert.equal(p.search('cafe', data).tasks.length, 1);
  assert.equal(p.search('gloves', data).notes.length, 1);
});

test('quick entry: plain titles untouched', () => {
  const now = at(2026, 11, 13, 14);
  for (const title of ['Finish legal studies notes', 'Pack running shoes', 'Email teacher', 'Buy birthday present',
    'Remember to bring sailing equipment', "Read today's article", 'Finish chapter 2']) {
    const e = C.parseQuickEntry(title, now);
    assert.equal(e.title, title);
    assert.equal(e.day, null);
    assert.equal(e.reminder, null);
  }
  assert.equal(C.parseQuickEntry('   ', now), null);
});

test('quick entry: days, times, importance', () => {
  const now = at(2026, 11, 13, 14); // Friday 2pm
  const e = C.parseQuickEntry('Email teacher tomorrow 3pm !', now);
  assert.equal(e.title, 'Email teacher');
  assert.equal(e.isImportant, true);
  assert.equal(e.day, '2026-11-14');
  assert.equal(+e.reminder, +at(2026, 11, 14, 15));
  assert.equal(+C.parseQuickEntry('Training on monday at 6:30am', now).reminder, +at(2026, 11, 16, 6, 30));
  assert.equal(+C.parseQuickEntry('Call mum 9am', now).reminder, +at(2026, 11, 14, 9));
  assert.equal(+C.parseQuickEntry('Revise tonight', now).reminder, +at(2026, 11, 13, 19));
  assert.equal(+C.parseQuickEntry('Gym at 17:15', now).reminder, +at(2026, 11, 13, 17, 15));
  assert.equal(C.parseQuickEntry('Essay due friday', now).day, '2026-11-13');
  assert.equal(C.parseQuickEntry('Plan trip next week', now).day, '2026-11-16');
  assert.equal(C.parseQuickEntry('tomorrow', now).title, 'tomorrow');
});

test('snooze times', () => {
  const ten = at(2026, 11, 13, 10);
  assert.equal(+C.snoozeUntil('fiveMinutes', ten), +ten + 300e3);
  assert.equal(+C.snoozeUntil('laterToday', ten), +at(2026, 11, 13, 18));
  assert.equal(+C.snoozeUntil('laterToday', at(2026, 11, 13, 16, 5)), +at(2026, 11, 13, 19, 15));
  assert.equal(+C.snoozeUntil('laterToday', at(2026, 11, 13, 21)), +at(2026, 11, 13, 23));
  assert.equal(+C.snoozeUntil('laterToday', at(2026, 11, 13, 22, 30)), +at(2026, 11, 13, 23, 30));
});

test('store: saves, keeps a backup, recovers from damage, never overwrites unreadable data', () => {
  const s = memoryStorage();
  const store = C.createStore(s);
  store.mutate((d) => C.addTask(d, C.newTask({ title: 'First' })));
  store.mutate((d) => C.addTask(d, C.newTask({ title: 'Second' })));
  assert.equal(C.createStore(s).load().tasks.length, 2);

  s.setItem('daybook:v1', '{ not json');
  assert.deepEqual(store.load().tasks.map((t) => t.title), ['First']);
  assert.ok(s.keys().some((k) => k.startsWith('daybook:v1:unreadable:')));

  const s2 = memoryStorage();
  s2.setItem('daybook:v1', 'garbage');
  const store2 = C.createStore(s2);
  assert.throws(() => store2.mutate((d) => C.addTask(d, C.newTask({ title: 'New' }))));
  assert.equal(s2.getItem('daybook:v1'), 'garbage');
});

test('store: reads Mac app backups and old or partial data', () => {
  const s = memoryStorage();
  s.setItem('daybook:v1', JSON.stringify({
    tasks: [
      { id: 'A', title: 'Old task', priority: 9, futureField: true },
      { title: 'no id, skipped' },
      { id: 'A', title: 'Duplicate, newer', modifiedAt: 1 },
    ],
    notes: [{ id: 'N', title: 'Note', checklist: [{ text: 'x' }, null] }],
  }));
  const data = C.createStore(s).load();
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].title, 'Duplicate, newer');
  assert.equal(data.tasks[0].priority, 0);
  assert.equal(data.notes[0].checklist.length, 1);
});

// ---------- Email summary ----------

const thread = (id, msgs) => ({ id, viewUrl: 'https://mail.google.com/mail/#all/' + id, messages: msgs });
const msg = (o) => ({ sender: 'teacher@school.edu', addressDisplayNames: [{ displayName: 'Ms Smith', emailAddress: 'teacher@school.edu' }], date: '2026-11-12T23:00:00Z', labelIds: ['INBOX'], subject: 'Excursion form', ...o });

test('email: text keeps the new part only', () => {
  const t = C.emailText('Hi Axel,\nPlease return the form by Friday.\n\nOn Tue, 10 Nov 2026 at 9:00, Bob <b@x.com> wrote:\n> old stuff\n> more');
  assert.equal(t, 'Hi Axel,\nPlease return the form by Friday.');
  assert.ok(C.emailText('x '.repeat(2000), 100).length <= 102);
  assert.match(C.emailText('See https://example.com/' + 'a'.repeat(80)), /https:\/\/example\.com\/…/);
  assert.equal(C.decodeEntities('You&#39;re &amp; me'), "You're & me");
});

test('email: items from threads', () => {
  const now = at(2026, 11, 13, 10);
  const items = C.mailItems([
    thread('T1', [msg({ plaintextBody: 'Please sign it.', labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'] })]),
    thread('T2', [msg({ date: '2026-11-12T01:00:00Z', plaintextBody: 'Question?' }), msg({ sender: 'me@x.com', labelIds: ['SENT'], plaintextBody: 'Answer' })]),
    { id: 'T3', messages: [msg({ snippet: 'Sale &amp; more', plaintextBody: '' })], viewUrl: 'javascript:alert(1)' },
    { messages: [] },
  ], now);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.ref), ['e1', 'e2', 'e3']);
  assert.equal(items[0].from, 'Ms Smith');
  assert.equal(items[0].unread, true);
  assert.equal(items[0].category, 'personal');
  assert.equal(items[0].day, '2026-11-13'); // 23:00 UTC is 10am in Sydney
  assert.equal(items[1].lastFromMe, true);
  assert.equal(items[1].text, 'Question?');
  assert.equal(items[2].text, 'Sale & more');
  assert.equal(items[2].url, null);
  const prompt = C.mailPrompt(items, now);
  assert.match(prompt, /Today is Friday 2026-11-13/);
  assert.match(prompt, /<email ref="e2">[\s\S]*sent by me/);
});

test('email: summary is checked, never guessed', () => {
  const now = at(2026, 11, 13, 10);
  const items = C.mailItems([thread('T1', [msg({ plaintextBody: 'a' })]), thread('T2', [msg({ plaintextBody: 'b' })]), thread('T3', [msg({ plaintextBody: 'c' })])], now);
  const s = C.cleanMailSummary({
    overview: 'Form due Friday.',
    reply: [{ ref: 'e1', why: 'She asked you to sign' }, { ref: 'e1', why: 'dup' }, { ref: 'e9', why: 'unknown email' }],
    dates: [{ ref: 'e1', what: 'Form due', day: '2026-11-20', time: null }, { ref: 'e2', what: 'Old', day: '2026-10-01' }, { ref: 'e2', what: 'Bad day', day: 'Friday' }],
    ignore: [{ ref: 'e1', why: 'also listed as reply' }, { ref: 'e2', why: 'newsletter' }],
    tasks: [{ ref: 'e1', title: 'Sign the excursion form', day: '2026-11-12', important: 'yes' }, { ref: 'e1', title: 'sign the excursion form', day: null }, { ref: 'e1', title: '  ' }],
  }, items, now);
  assert.deepEqual(s.reply, [{ ref: 'e1', why: 'She asked you to sign' }]);
  assert.deepEqual(s.dates, [{ ref: 'e1', what: 'Form due', day: '2026-11-20', time: null }]);
  assert.deepEqual(s.ignore, [{ ref: 'e2', why: 'newsletter' }]);
  assert.deepEqual(s.other, [{ ref: 'e3' }]);
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].day, '2026-11-13'); // yesterday's deadline becomes today
  assert.equal(s.tasks[0].important, false);
  assert.deepEqual(C.cleanMailSummary('nonsense', items, now).other.length, 3);
});

test('email: suggested task is added once', () => {
  const now = at(2026, 11, 13, 10);
  const [item] = C.mailItems([thread('T1', [msg({ plaintextBody: 'a' })])], now);
  const sug = { ref: 'e1', title: 'Sign the form', day: '2026-11-14', important: true };
  const data = C.emptyData();
  assert.equal(C.mailTaskAdded(data, sug, item), false);
  const t = C.mailTask(sug, item, now);
  assert.equal(t.dueDay, '2026-11-14');
  assert.equal(t.fromEmail, 'T1');
  assert.match(t.details, /Excursion form/);
  C.addTask(data, t);
  assert.equal(C.mailTaskAdded(data, sug, item), true);
  assert.equal(C.cleanData(JSON.parse(JSON.stringify(data))).tasks[0].fromEmail, 'T1'); // kept when saved and read back
});
