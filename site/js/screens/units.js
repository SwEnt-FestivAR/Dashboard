// Screen "units" (a Screen + ViewModel pair, see the schema in scripts/fetch-data.mjs): statuses,
// status periods over time, linked issues and planned screens. Pure logic, no HTML except the status bar.

import { norm, plural, ts } from '../core/utils.js';
import { D, NOW, STATUS, assigneesOf } from '../core/store.js';

/**
 * Screen statuses, in progress order. `css` names the color variable in style.css (:root).
 * planned / in-dev / developed are computed by autoStatus(); finalized is only set by hand in status.json.
 * To add a status, add it here and its --s-* color in style.css.
 */
export const STATUSES = [
  { id: 'planned', label: 'Planned', css: '--s-planned', desc: 'Not in the code yet, only mentioned in an open issue' },
  { id: 'in-dev', label: 'In development', css: '--s-indev', desc: 'Screen or ViewModel missing on main, or open issues about it' },
  { id: 'developed', label: 'Developed', css: '--s-developed', desc: 'Screen and ViewModel on main, no open issue about it' },
  { id: 'finalized', label: 'Finalized', css: '--s-finalized', desc: 'Done and validated by the team (set by hand in status.json)' },
];
/** The STATUSES entry of a status id (undefined for an unknown id). */
export const statusInfo = (id) => STATUSES.find((s) => s.id === id);

/** A unit's id, e.g. "task/CreateTask". It is also its key in status.json. */
export const unitId = (u) => `${u.feature}/${u.key}`;

// The status rules below take a date `t` (unix seconds, NOW by default), so the timeline can replay them in
// the past: a file counts from its `created` date (on main: its first commit there), an issue while open.
const existsAt = (file, t) => Boolean(file) && file.created <= t;
const onMainAt = (file, t) => existsAt(file, t) && !file.inPR && !file.inBranch;
const openAt = (issue, t) => ts(issue.c) <= t && !(issue.cl && ts(issue.cl) <= t);
const openIssuesAt = (u, t) => unitIssues(u, true).filter((i) => openAt(i, t));

/**
 * Why a screen is in development at date t (empty when it is not): Screen or ViewModel not on main yet, or
 * open issues about it. Branches and open PRs touching files already on main do not count: once both files
 * are merged and no issue is open, the screen is developed, even while someone improves it (the card still
 * shows those PRs and branches).
 */
export function inDevReasons(u, t = NOW) {
  const issues = openIssuesAt(u, t).length;
  return [
    !onMainAt(u.screen, t) && 'Screen not on main',
    !onMainAt(u.viewModel, t) && 'ViewModel not on main',
    issues && plural(issues, 'open issue'),
  ].filter(Boolean);
}

/**
 * Status deduced from code and issues at date t: planned (no file yet, only an open issue) < in-dev (see
 * inDevReasons) < developed. null when the screen did not exist in any form yet.
 */
function autoStatus(u, t = NOW) {
  if (!existsAt(u.screen, t) && !existsAt(u.viewModel, t)) return openIssuesAt(u, t).length ? 'planned' : null;
  return inDevReasons(u, t).length ? 'in-dev' : 'developed';
}

/** Effective status: a valid status.json entry (in practice "finalized") wins over autoStatus(). */
export function unitStatus(u) {
  const manual = STATUS.screens[unitId(u)];
  const isManual = Boolean(statusInfo(manual?.status));
  return { status: isManual ? manual.status : autoStatus(u), manual: isManual, note: manual?.note };
}

/**
 * The status of a unit over time, with no history needed: [{ status, from, to }] in unix seconds, oldest first,
 * the last one ending at NOW. The automatic status can only change when a file is created or an issue about it
 * is opened or closed, so autoStatus() is evaluated once between each pair of those dates (equal neighbours
 * are merged, and nothing is drawn before the screen existed in any form). See withManualStatus() for status.json.
 */
export function statusPeriods(u) {
  const dates = [
    ...unitIssues(u, true).flatMap((i) => [ts(i.c), ts(i.cl)]),
    ...[u.screen, u.viewModel].filter(Boolean).map((f) => f.created),
  ];
  const cuts = [...new Set(dates)].filter((t) => t && t < NOW).sort((a, b) => a - b);
  const periods = [];
  cuts.forEach((from, i) => {
    const to = cuts[i + 1] ?? NOW, status = autoStatus(u, (from + to) / 2);
    const last = periods.at(-1);
    if (last?.status === status) last.to = to;
    else if (status) periods.push({ status, from, to });
  });
  return withManualStatus(u, periods);
}

/**
 * Periods with the manual status of status.json on top: it starts at its `since` date (earlier periods are cut
 * there) or, without a date, replaces the status of the last period.
 */
function withManualStatus(u, periods) {
  const { status, since } = STATUS.screens[unitId(u)] || {};
  if (!statusInfo(status) || !periods.length) return periods;
  const from = ts(since);
  if (!from) return [...periods.slice(0, -1), { ...periods.at(-1), status }];
  const before = periods.filter((p) => p.from < from).map((p) => ({ ...p, to: Math.min(p.to, from) }));
  return [...before, { status, from, to: NOW }];
}

/**
 * Issues about a screen (open ones only, unless `includeClosed`): issues whose normalized title contains the
 * screen key ("Use DataRepository in Task details" -> taskdetails -> TaskDetails), plus the numbers listed in
 * status.json ("issues": [123]) and, for planned units, the issues they were found in.
 * Only titles are matched: the fetch script does not store issue bodies.
 */
export function unitIssues(u, includeClosed = false) {
  const key = norm(u.key);
  const extra = [...(STATUS.screens[unitId(u)]?.issues || []), ...Object.values(u.plannedIssues || {}).flat()];
  return D.issues.filter((i) => (includeClosed || i.s === 'open') && (norm(i.title).includes(key) || extra.includes(i.n)));
}

/** Logins assigned to the open issues of a unit. */
export const unitAssignees = (u) => assigneesOf(unitIssues(u));

const PLANNED_RE = /\b(?:the|a|an)\s+([a-z][a-z0-9 ]{1,60}?)\s+(screen|viewmodel)s?\b/i;
const FILLER_WORDS = /\b(?:the|a|an|to|of|in|for|on|with)\b/i;

/**
 * Screens that only exist in open issue titles ("Implement the My tasks Screen").
 * Takes the words before "Screen"/"ViewModel" (after the last filler word, at most 4 words) and makes a
 * unit with `planned: true`, unless a unit with that name already exists on main or in a PR. So
 * "Add the delete confirmation to the Event Details Screen" is ignored because EventDetails exists.
 * The feature is guessed from the words (tasks -> task), "other" otherwise.
 * Planned units have no files; `plannedIssues` = { screen: [n], viewModel: [n] } replaces them.
 */
export function plannedUnits(units, issues) {
  const features = new Set(units.map((u) => u.feature));
  const existing = units.map((u) => norm(u.key));
  const found = {};
  for (const issue of issues.filter((i) => i.s === 'open')) {
    const m = PLANNED_RE.exec(issue.title);
    if (!m) continue;
    const words = m[1].split(FILLER_WORDS).pop().trim().split(/\s+/).filter(Boolean);
    const k = norm(words.join(''));
    if (!words.length || words.length > 4 || existing.some((e) => k.includes(e) || e.includes(k))) continue;
    found[k] ||= {
      feature: words.map((w) => w.toLowerCase().replace(/s$/, '')).find((w) => features.has(w)) || 'other',
      key: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
      planned: true, screen: null, viewModel: null, openPRs: [], branches: [],
      tests: { ui: [], unit: [] }, plannedIssues: { screen: [], viewModel: [] },
    };
    found[k].plannedIssues[/^screen$/i.test(m[2]) ? 'screen' : 'viewModel'].push(issue.n);
  }
  return Object.values(found);
}

/** Segments of a stacked progress bar (one per status) for a list of units. */
export function statusBar(units) {
  return STATUSES.map((s) => {
    const n = units.filter((u) => unitStatus(u).status === s.id).length;
    return n ? `<div style="width:${(100 * n) / units.length}%;background:var(${s.css})" title="${s.label}: ${n}"></div>` : '';
  }).join('');
}
