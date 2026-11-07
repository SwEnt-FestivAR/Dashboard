// Screen "units" (a Screen + ViewModel pair, see the schema in scripts/fetch-data.mjs): statuses,
// linked issues and planned screens. Pure logic, no HTML except the status bar.

import { DAY, norm, ts, uniq } from '../core/utils.js';
import { D, STATUS } from '../core/store.js';

/**
 * Screen statuses, in progress order. `css` names the color variable in style.css (:root).
 * planned / in-dev / developed / tested are computed by autoStatus(); finalized / frozen only come from
 * status.json. To add a status, add it here and its --s-* color in style.css.
 */
export const STATUSES = [
  { id: 'planned', label: 'Planned', css: '--s-planned', desc: 'Not in the code yet, only mentioned in an open issue' },
  { id: 'in-dev', label: 'In development', css: '--s-indev', desc: 'Not on main yet: only in an open PR or a branch' },
  { id: 'developed', label: 'Developed', css: '--s-developed', desc: 'Merged on main' },
  { id: 'tested', label: 'Tested', css: '--s-tested', desc: 'Merged, with UI tests (and ViewModel unit tests)' },
  { id: 'finalized', label: 'Finalized', css: '--s-finalized', desc: 'Done, only small fixes expected' },
  { id: 'frozen', label: 'Frozen', css: '--s-frozen', desc: 'Finalized and must not be touched anymore' },
];
export const statusInfo = (id) => STATUSES.find((s) => s.id === id);

/** A unit's id, e.g. "task/CreateTask". It is also its key in status.json. */
export const unitId = (u) => `${u.feature}/${u.key}`;

const onMain = (file) => file && !file.inPR && !file.inBranch;

/** Status deduced from code and issues: planned < in-dev (only in a PR or a branch) < developed (on main) < tested. */
function autoStatus(u) {
  if (u.planned) return 'planned';
  if (!onMain(u.screen) && !onMain(u.viewModel)) return 'in-dev';
  if (u.tests.ui.length && (!onMain(u.viewModel) || u.tests.unit.length)) return 'tested';
  return 'developed';
}

/**
 * Effective status: a valid status.json entry wins over autoStatus().
 * frozenBroken = frozen, but an open PR or a branch touches it, or a file changed more than a day after `since`.
 */
export function unitStatus(u) {
  const manual = STATUS.screens[unitId(u)];
  const status = statusInfo(manual?.status) ? manual.status : autoStatus(u);
  const lastChange = Math.max(u.screen?.lastModified || 0, u.viewModel?.lastModified || 0);
  const frozenSince = ts(manual?.since);
  const touchedElsewhere = u.openPRs.length > 0 || u.branches?.length > 0;
  const frozenBroken = status === 'frozen' && (touchedElsewhere || (frozenSince && lastChange > frozenSince + DAY));
  return { status, manual: Boolean(statusInfo(manual?.status)), note: manual?.note, frozenBroken };
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
export const unitAssignees = (u) => uniq(unitIssues(u).flatMap((i) => i.as));

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
      planned: true, screen: null, viewModel: null, openPRs: [],
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
