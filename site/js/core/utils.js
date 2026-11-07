// Generic helpers. Nothing here knows about the dashboard data: put data-aware helpers in store.js
// and HTML building blocks in ui.js.

export const DAY = 86400; // seconds

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML-escapes a value. Every piece of GitHub data inserted with innerHTML must go through it. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Current value of a CSS custom property, e.g. css('--muted'). Used to give canvas charts theme colors. */
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** ISO date -> unix seconds (null stays null). */
export const ts = (iso) => (iso ? Date.parse(iso) / 1000 : null);

export const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtNum = (n) => n.toLocaleString('en-US');

/** "3 issues", "1 issue". */
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Lowercase letters and digits only: "Task details" and "TaskDetails" both become "taskdetails". */
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
