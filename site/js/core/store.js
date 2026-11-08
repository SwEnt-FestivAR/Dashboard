// The loaded data, shared by every module.
//   D      = site/data.json (schema documented at the top of scripts/fetch-data.mjs)
//   STATUS = status.json (manual screen statuses)
//   NOW    = D.generatedAt in unix seconds. It is the "now" of the whole UI, so ages and periods are
//            relative to the last data refresh, not to when the page is opened.
// They are ES module live bindings: set once by initStore() at boot, then only read.

import { DAY, esc, ts, uniq } from './utils.js';

// Set once by initStore(), then only read (see the module comment above).
export let D = null;
export let STATUS = { screens: {} };
export let NOW = 0;

/** One color per person, assigned in login order so a person keeps the same color in every chart. */
const PALETTE = ['#6d4aff', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#84cc16', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

/** Stores the data and derives what every tab needs (person colors, readable commit objects). */
export function initStore(data, status) {
  D = data;
  STATUS = { ...status, screens: status?.screens || {} };
  NOW = ts(D.generatedAt);
  Object.values(D.people)
    .sort((a, b) => a.login.localeCompare(b.login))
    .forEach((p, i) => (p.color = PALETTE[i % PALETTE.length]));
  D.commits = D.commits.map(([t, a, add, del]) => ({ t, a, add, del }));
}

/** Person lookup that never fails: unknown logins get a placeholder. */
export const P = (login) => D.people[login] || { login, name: login || 'unknown', avatar: '', bot: false, color: '#64748b' };
/** Chart color of a person (stable, see PALETTE). */
export const color = (login) => P(login).color;

/** Link into the FestivAR repo, e.g. repoUrl('/pull/12'). */
export const repoUrl = (path = '') => `https://github.com/${D.repo}${path}`;
/** status.json of this dashboard repo on GitHub (mode "blob" to view, "edit" to edit). */
export const statusFileUrl = (mode = 'blob') => `https://github.com/${D.siteRepo}/${mode}/main/status.json`;

/** Unix seconds -> "5h ago", "3d ago", "2mo ago", relative to NOW. */
export function ago(t) {
  if (!t) return '—';
  const days = (NOW - t) / DAY;
  if (days < 1 / 24) return 'just now';
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** Escaped display name of a login. */
export const nameOf = (login) => esc(P(login).name);

/** An issue counts as solved when closed as completed; issues closed as "not planned" don't. */
export const isCompleted = (i) => i.s === 'closed' && i.r !== 'not_planned';

/** Logins assigned to any of the issues, without duplicates. */
export const assigneesOf = (issues) => uniq(issues.flatMap((i) => i.as));
