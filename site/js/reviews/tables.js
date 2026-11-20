// HTML tables of the Reviews tab: per-person stats, team-wide averages, and the who-reviews-whom heatmap.

import { esc, fmtDuration } from '../core/utils.js';
import { P, nameOf } from '../core/store.js';
import { avatar } from '../core/ui.js';
import { reviewMatrix } from './stats.js';

const fmtRatio = (x) => (x == null ? '—' : x.toFixed(1));
const who = (login) => (login ? `<span class="who">${avatar(login, 'xs')}${nameOf(login)}</span>` : '—');

// Columns of the per-person table: [header, tooltip, cell from a reviewerStats() row]
const PERSON_COLUMNS = [
  ['Reviews', 'reviews submitted on PRs of others', (s) => s.reviews],
  ['Line comments', 'inline comments in those reviews', (s) => s.lineComments],
  ['Per review', 'line comments per review, mean', (s) => fmtRatio(s.lcPerReview)],
  ['Own PRs', 'mean open → merge of their own PRs', (s) => fmtDuration(s.ownCycle)],
  ['Reviewed PRs', 'mean open → merge of the PRs of others they reviewed', (s) => fmtDuration(s.reviewedCycle)],
  ['Reviews most', 'author whose PRs they reviewed the most', (s) => who(s.topReviewee)],
  ['Request → review', 'mean / median time from a review request to their review',
    (s) => `${fmtDuration(s.meanAnswer)} / ${fmtDuration(s.medianAnswer)}`],
];

/** One row per person of reviewerStats(), sorted as given. */
export function personTable(stats) {
  if (!stats.length) return '<div class="empty">No review data yet</div>';
  const head = PERSON_COLUMNS.map(([h, tip]) => `<th title="${tip}">${h}</th>`).join('');
  const rows = stats.map((s) => `<tr><th>${who(s.login)}</th>${PERSON_COLUMNS.map(([, , cell]) => `<td>${cell(s)}</td>`).join('')}</tr>`);
  return `<table class="stat-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

/** Mean and median of the team-wide measures of overview(). */
export function overallTable(o) {
  const rows = [
    ['Open → first review', o.firstReview, fmtDuration],
    ['Open → close', o.close, fmtDuration],
    ['Line comments per merged PR', o.lcPerPR, fmtRatio],
    ['Reviews per merged PR', o.reviewsPerPR, fmtRatio],
  ].map(([label, { mean, median }, fmt]) => `<tr><th>${label}</th><td>${fmt(mean)}</td><td>${fmt(median)}</td></tr>`);
  return `<table class="stat-table"><thead><tr><th></th><th>Mean</th><th>Median</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

/** Heatmap table: cell opacity grows with the count; the diagonal (self) is greyed out. */
export function matrixTable(logins) {
  const m = reviewMatrix();
  const max = Math.max(1, ...Object.values(m).flatMap((row) => Object.values(row)));
  if (!Object.keys(m).length) return '<div class="empty">No review data yet</div>';
  const head = logins.map((l) => `<th>${avatar(l, 'sm')}</th>`).join('');
  const rows = logins.map((r) => `<tr><th class="who">${avatar(r, 'sm')}${esc(P(r).name)}</th>${logins.map((a) => {
    if (a === r) return '<td class="self"></td>';
    const n = m[r]?.[a] || 0;
    return `<td style="--k:${n / max}" title="${esc(P(r).name)} reviewed ${n} PR(s) of ${esc(P(a).name)}">${n || ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
