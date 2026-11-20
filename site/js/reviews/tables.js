// HTML tables of the Reviews tab: per-person stats, team-wide averages, and the who-reviews-whom heatmap.

import { esc, fmtDuration } from '../core/utils.js';
import { P, nameOf } from '../core/store.js';
import { avatar } from '../core/ui.js';
import { reviewMatrix } from './stats.js';

/** How "ready for review" is defined, shown under both tables. */
const READY = '<b>Ready for review</b> = when the PR was opened, or taken out of draft if it was opened as one: '
  + 'time spent as a draft is not counted, and PRs still in draft (or closed as drafts) are left out of the times.';

const fmtRatio = (x) => (x == null ? '—' : x.toFixed(1));
const who = (login) => (login ? `<span class="who">${avatar(login, 'xs')}${nameOf(login)}</span>` : '—');

// Columns of the per-person table: [header, sentence explaining it (shown under the table), cell from a reviewerStats() row]
const PERSON_COLUMNS = [
  ['Reviews given', 'reviews this person submitted on other people\'s PRs.', (s) => s.reviews],
  ['Line comments written', 'comments on a specific line of code, in all those reviews.', (s) => s.lineComments],
  ['Line comments per review', 'average number of line comments in one of their reviews.', (s) => fmtRatio(s.lcPerReview)],
  ['Their PRs: time to merge', 'average time between one of their own PRs being ready for review and its merge.',
    (s) => fmtDuration(s.ownCycle)],
  ['PRs they reviewed: time to merge', 'the same average, for the PRs of others they reviewed.',
    (s) => fmtDuration(s.reviewedCycle)],
  ['Reviews most', 'the person whose PRs they reviewed the most.', (s) => who(s.topReviewee)],
  ['Answer to a request (mean / median)', 'time between someone asking them for a review and their review: average / median.',
    (s) => `${fmtDuration(s.meanAnswer)} / ${fmtDuration(s.medianAnswer)}`],
];

/** One row per person of reviewerStats(), sorted as given, followed by what each column means. */
export function personTable(stats) {
  if (!stats.length) return '<div class="empty">No review data yet</div>';
  const head = PERSON_COLUMNS.map(([h]) => `<th>${h}</th>`).join('');
  const rows = stats.map((s) => `<tr><th>${who(s.login)}</th>${PERSON_COLUMNS.map(([, , cell]) => `<td>${cell(s)}</td>`).join('')}</tr>`);
  const defs = PERSON_COLUMNS.map(([h, sentence]) => `<li><b>${h}</b>: ${sentence}</li>`).join('');
  return `<table class="stat-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>
    <ul class="defs muted small">${defs}<li>${READY}</li></ul>`;
}

/** Mean and median of the team-wide measures of overview(), each row with a sentence saying what it measures. */
export function overallTable(o) {
  const rows = [
    ['Wait for a first review', 'time between a PR being ready for review and its first review by someone else', o.firstReview,
      fmtDuration],
    ['Time to close a PR', 'time between a PR being ready for review and its closing (merged or not)', o.close, fmtDuration],
    ['Line comments per PR', 'line comments received by a merged PR', o.lcPerPR, fmtRatio],
    ['Reviews per PR', 'reviews received by a merged PR', o.reviewsPerPR, fmtRatio],
  ].map(([label, sentence, { mean, median }, fmt]) =>
    `<tr><th>${label}<div class="muted small">${sentence}</div></th><td>${fmt(mean)}</td><td>${fmt(median)}</td></tr>`);
  return `<table class="stat-table"><thead><tr><th></th><th>Mean</th><th>Median</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <ul class="defs muted small"><li>${READY}</li></ul>`;
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
