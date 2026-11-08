// Generic helpers. Nothing here knows about the dashboard data: put data-aware helpers in store.js
// and HTML building blocks in ui.js.

/** One day, in seconds (dates are unix seconds everywhere in the site). */
export const DAY = 86400;

/** DOM shortcuts: the first element / all the elements matching a CSS selector. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML-escapes a value. Every piece of GitHub data inserted with innerHTML must go through it. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Current value of a CSS custom property, e.g. css('--muted'). Used to give canvas charts theme colors. */
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** ISO date -> unix seconds (null stays null). */
export const ts = (iso) => (iso ? Date.parse(iso) / 1000 : null);

/** "7 Nov 2026", or "—" without a date. */
export const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** "1,234". */
export const fmtNum = (n) => n.toLocaleString('en-US');
/** "7 Nov", for chart labels and axes. */
export const fmtShortDate = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Sum of value(item) over the items. */
export const sumBy = (items, value) => items.reduce((total, item) => total + value(item), 0);

/** "3 issues", "1 issue"; `many` overrides the plural form ("branches"). */
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Lowercase letters and digits only: "Task details" and "TaskDetails" both become "taskdetails". */
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A week (sprint) runs from Friday 12:00 to the next Friday 12:00, in the viewer's local time. */
export const WEEK_START = { day: 5, hour: 12 }; // day: 0 = Sunday … 5 = Friday

/** Unix time of the start (Friday 12:00 local) of the week that contains t. */
export function weekStart(t) {
  const d = new Date(t * 1000);
  d.setDate(d.getDate() - ((d.getDay() - WEEK_START.day + 7) % 7));
  d.setHours(WEEK_START.hour, 0, 0, 0);
  if (d.getTime() / 1000 > t) d.setDate(d.getDate() - 7); // Friday morning still belongs to the previous week
  return d.getTime() / 1000;
}

/** t moved by n weeks in local calendar time, so a Friday 12:00 stays 12:00 across daylight-saving changes. */
export function addWeeks(t, n) {
  const d = new Date(t * 1000);
  d.setDate(d.getDate() + 7 * n);
  return d.getTime() / 1000;
}

/** "Fri 31 Oct, 12:00". */
export const fmtWeekDay = (t) => new Date(t * 1000)
  .toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Median of a list of numbers (null for an empty list). */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Seconds -> "5h", "2.5d". */
export function fmtDuration(sec) {
  if (sec == null) return '—';
  return sec < DAY ? `${Math.round(sec / 3600)}h` : `${(sec / DAY).toFixed(1)}d`;
}

/** The items without duplicates, in first-seen order. */
export const uniq = (items) => [...new Set(items)];

/** { key: count } of how many times each key appears. */
export function countBy(keys) {
  const out = {};
  for (const k of keys) out[k] = (out[k] || 0) + 1;
  return out;
}

/** Adds the value to the set, or removes it if it is already there. */
export function toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

/**
 * Wires a segmented control (<div class="seg"> of buttons): a click marks the button .on and calls
 * onPick(button.dataset[key]).
 */
export function seg(sel, key, onPick) {
  const buttons = $$(`${sel} button`);
  for (const b of buttons) {
    b.addEventListener('click', () => {
      for (const x of buttons) x.classList.toggle('on', x === b);
      onPick(b.dataset[key]);
    });
  }
}
