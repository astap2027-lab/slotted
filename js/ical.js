// Reading calendar links (iCalendar, .ics): Google Calendar, Apple/iCloud, Outlook and school apps all share
// calendars this way. Pure functions only: the page fetches the text (through /api/calendar/fetch) and these
// turn it into plain events for the weeks Slotted plans. Times come out in the device's time zone.

// ---------- time zones ----------
// Outlook and some school systems use Windows names for time zones.
const WINDOWS_ZONES = {
  'AUS Eastern Standard Time': 'Australia/Sydney', 'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide', 'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth', 'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC',
  'Pacific Standard Time': 'America/Los_Angeles', 'Eastern Standard Time': 'America/New_York',
};
const zoneFormats = new Map();
function zoneFormat(tz) {
  if (!zoneFormats.has(tz)) {
    zoneFormats.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  }
  return zoneFormats.get(tz);
}
// A usable IANA zone name, or null when the name isn't known.
export function cleanZone(tzid) {
  if (!tzid) return null;
  let z = String(tzid).replace(/^"|"$/g, '').replace(/^\/+/, '').trim();
  if (WINDOWS_ZONES[z]) z = WINDOWS_ZONES[z];
  // Some feeds prefix the name (for example "/mozilla.org/20050126_1/Australia/Sydney").
  const m = z.match(/([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/);
  if (m && !isZone(z)) z = m[1];
  return isZone(z) ? z : null;
}
function isZone(z) { try { zoneFormat(z); return true; } catch { return false; } }

// Wall-clock fields in a zone for an instant.
export function inZone(ms, tz) {
  const p = Object.fromEntries(zoneFormat(tz).formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
const offsetAt = (ms, tz) => { const f = inZone(ms, tz); return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(ms / 1000) * 1000; };
// The instant of a wall-clock time in a zone (handles daylight saving).
export function fromZone(f, tz) {
  const guess = Date.UTC(f.y, f.mo - 1, f.d, f.h || 0, f.mi || 0, f.s || 0);
  let t = guess - offsetAt(guess, tz);
  const again = guess - offsetAt(t, tz);
  if (again !== t) t = again;
  return t;
}

// ---------- reading the text ----------
const unescapeText = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\:])/g, '$1').trim();

// One property line: NAME;PARAM=x;PARAM="y":value
function parseLine(line) {
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) break;
  }
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = head.match(/(?:[^;"]|"[^"]*")+/g) || [''];
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

// "20261116T094000Z", "20261116T094000" (with TZID or floating), "20261116" (a date).
function parseDate(value, params, defaultTz) {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const f = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const allDay = !m[4] || (params && params.VALUE === 'DATE');
  const tz = m[7] ? 'UTC' : cleanZone(params && params.TZID) || defaultTz;
  return { f, allDay, tz };
}

// "PT1H30M", "P1D", "-PT15M"
function parseDuration(v) {
  const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

/**
 * Parse calendar text into raw events. Returns { name, events: [{ uid, summary, location, start, end, duration,
 * rrule, exdates, recurrenceId, cancelled, free }] }, with start/end as { f, allDay, tz }.
 */
export function parseICS(text, { tz } = {}) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let name = '';
  let cur = null;
  let depth = 0; // nested blocks inside an event (alarms) are skipped
  for (const raw of lines) {
    if (!raw) continue;
    const { name: key, params, value } = parseLine(raw);
    if (key === 'BEGIN' && value.toUpperCase() === 'VEVENT') { cur = { exdates: [], params: {} }; depth = 0; continue; }
    if (!cur) { if (key === 'X-WR-CALNAME') name = unescapeText(value); continue; }
    if (key === 'BEGIN') { depth++; continue; }
    if (key === 'END' && value.toUpperCase() !== 'VEVENT') { depth = Math.max(0, depth - 1); continue; }
    if (key === 'END') { events.push(cur); cur = null; continue; }
    if (depth) continue;
    switch (key) {
      case 'UID': cur.uid = value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeText(value); break;
      case 'LOCATION': cur.location = unescapeText(value); break;
      case 'DTSTART': cur.start = parseDate(value, params, tz); break;
      case 'DTEND': cur.end = parseDate(value, params, tz); break;
      case 'DURATION': cur.duration = parseDuration(value); break;
      case 'RRULE': cur.rrule = Object.fromEntries(value.split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.toUpperCase(), v])); break;
      case 'EXDATE': for (const v of value.split(',')) { const d = parseDate(v, params, tz); if (d) cur.exdates.push(d); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(value, params, tz); break;
      case 'STATUS': cur.cancelled = value.trim().toUpperCase() === 'CANCELLED'; break;
      case 'TRANSP': cur.free = value.trim().toUpperCase() === 'TRANSPARENT'; break;
      default: break;
    }
  }
  return { name, events: events.filter((e) => e.start) };
}

// ---------- dates ----------
const DAY_MS = 86400000;
const dayNum = (f) => Math.floor(Date.UTC(f.y, f.mo - 1, f.d) / DAY_MS); // days since 1970 for a calendar date
const fromDayNum = (n) => { const d = new Date(n * DAY_MS); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const weekdayOf = (n) => (n + 3) % 7; // 0 = Monday (1970-01-01 was a Thursday)
const WD = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const ymd = (f) => `${f.y}-${String(f.mo).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
const hm = (f) => `${String(f.h).padStart(2, '0')}:${String(f.mi).padStart(2, '0')}`;

// The instant an event time refers to. All-day dates count from midnight in the device's zone.
function instantOf(dt, localTz) {
  if (dt.allDay) return fromZone({ ...dt.f, h: 0, mi: 0, s: 0 }, localTz);
  return fromZone(dt.f, dt.tz || localTz);
}

// Start dates (calendar dates, as day numbers) of a repeating event, in order, until `lastDay`.
function* repeats(rule, startDay, lastDay) {
  const freq = String(rule.FREQ || '').toUpperCase();
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((x) => WD[x.replace(/^[+-]?\d+/, '').toUpperCase()]).filter((x) => x !== undefined) : null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number).filter((x) => x > 0) : null;
  let guard = 0;
  if (freq === 'DAILY') {
    for (let n = startDay; n <= lastDay && guard++ < 5000; n += interval) if (!byDay || byDay.includes(weekdayOf(n))) yield n;
  } else if (freq === 'WEEKLY') {
    const days = (byDay && byDay.length ? byDay : [weekdayOf(startDay)]).slice().sort((a, b) => a - b);
    const monday = startDay - weekdayOf(startDay);
    for (let w = monday; w <= lastDay && guard++ < 5000; w += 7 * interval) {
      for (const d of days) { const n = w + d; if (n >= startDay && n <= lastDay) yield n; }
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const s = fromDayNum(startDay);
    const step = freq === 'MONTHLY' ? interval : 12 * interval;
    for (let k = 0; guard++ < 2000; k += step) {
      const y = s.y + Math.floor((s.mo - 1 + k) / 12);
      const mo = ((s.mo - 1 + k) % 12) + 1;
      if (Date.UTC(y, mo - 1, 1) / DAY_MS > lastDay) break;
      for (const md of (freq === 'MONTHLY' && byMonthDay ? byMonthDay : [s.d])) {
        const dt = new Date(Date.UTC(y, mo - 1, md));
        if (dt.getUTCMonth() !== mo - 1) continue; // the 31st in a short month
        const n = Math.floor(dt.getTime() / DAY_MS);
        if (n >= startDay && n <= lastDay) yield n;
      }
    }
  } else {
    yield startDay;
  }
}

/**
 * Events overlapping [fromMs, toMs), expanded and in the device's zone.
 * @returns [{ uid, title, location, start, end (ms), allDay, free, date ('YYYY-MM-DD'), startTime, endTime ('HH:MM'),
 *   days: ['YYYY-MM-DD', ...] for all-day events }]
 */
export function eventsBetween(text, fromMs, toMs, { tz } = {}) {
  const localTz = cleanZone(tz) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { events } = parseICS(text, { tz: localTz });
  // Single changed occurrences of a repeating event replace the original one.
  const moved = new Map();
  for (const e of events) if (e.recurrenceId) {
    const k = `${e.uid}|${instantOf(e.recurrenceId, localTz)}`;
    moved.set(k, e);
  }
  const out = [];
  const add = (e, startMs, endMs, allDay) => {
    if (e.cancelled || endMs <= fromMs || startMs >= toMs) return;
    const s = inZone(startMs, localTz);
    const en = inZone(Math.max(startMs, endMs - (allDay ? 1 : 0)), localTz);
    const item = { uid: e.uid || '', title: e.summary || '', location: e.location || '', start: startMs, end: endMs, allDay, free: !!e.free, date: ymd(s) };
    if (allDay) {
      item.days = [];
      for (let n = dayNum(s); n <= dayNum(en) && item.days.length < 31; n++) item.days.push(ymd(fromDayNum(n)));
    } else {
      item.startTime = hm(s);
      // Something running past midnight is cut at the end of its first day.
      item.endTime = ymd(en) === item.date ? hm(en) : '23:59';
    }
    out.push(item);
  };
  for (const e of events) {
    if (e.recurrenceId) { add(e, instantOf(e.start, localTz), endOf(e, instantOf(e.start, localTz), localTz), e.start.allDay); continue; }
    const startMs = instantOf(e.start, localTz);
    const len = endOf(e, startMs, localTz) - startMs;
    if (!e.rrule) { add(e, startMs, startMs + len, e.start.allDay); continue; }
    // Repeats keep the wall-clock time in the event's own zone, so daylight saving doesn't shift them.
    const zone = e.start.allDay ? localTz : (e.start.tz || localTz);
    const startDay = dayNum(e.start.f);
    const lastDay = dayNum(inZone(toMs, zone)) + 1;
    const until = e.rrule.UNTIL ? parseDate(e.rrule.UNTIL, {}, zone) : null;
    const untilMs = until ? (until.allDay ? fromZone({ ...until.f, h: 23, mi: 59, s: 59 }, zone) : instantOf(until, zone)) : Infinity;
    const count = Number(e.rrule.COUNT) || Infinity;
    const ex = new Set(e.exdates.map((d) => (d.allDay ? ymd(d.f) : instantOf(d, localTz))));
    let n = 0;
    for (const day of repeats(e.rrule, startDay, lastDay)) {
      const f = { ...fromDayNum(day), h: e.start.f.h, mi: e.start.f.mi, s: e.start.f.s };
      const occ = e.start.allDay ? fromZone({ ...f, h: 0, mi: 0, s: 0 }, zone) : fromZone(f, zone);
      if (occ > untilMs || n >= count) break;
      n++;
      if (ex.has(occ) || ex.has(ymd(f))) continue;
      if (moved.has(`${e.uid}|${occ}`)) continue; // shown as its changed copy instead
      add(e, occ, occ + len, e.start.allDay);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function endOf(e, startMs, localTz) {
  if (e.end) {
    const t = instantOf(e.end, localTz);
    if (t > startMs) return t;
  }
  if (e.duration && e.duration > 0) return startMs + e.duration;
  return e.start.allDay ? startMs + DAY_MS : startMs;
}

// "webcal://" links are ordinary https links for calendar apps.
export const calendarUrl = (url) => String(url || '').trim().replace(/^webcals?:\/\//i, 'https://');
