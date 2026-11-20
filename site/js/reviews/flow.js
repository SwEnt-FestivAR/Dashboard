// PR-flow statistics of the Reviews tab: weekly series, team-wide averages and PR sizes, from D.prs.
// PRs by bots are ignored; the review counts reuse peerReviews() (self-reviews and bots excluded).

import { addWeeks, mean, median, sumBy, ts, weekStart } from '../core/utils.js';
import { D } from '../core/store.js';
import { firstReviewWait, isHuman, peerReviews, readyAt } from './stats.js';

/** PR size buckets, by lines added + deleted. */
export const SIZES = [['S', 100], ['M', 400], ['L', 1000], ['XL', Infinity]];
const sizeOf = (lines) => SIZES.find(([, max]) => lines < max)[0];

const humanPRs = () => D.prs.filter((p) => isHuman(p.a));
/** Seconds from being ready for review (see readyAt) to closing, merged or not; null while open or for drafts. */
const closeTime = (pr) => (pr.cl && readyAt(pr) != null ? ts(pr.cl) - readyAt(pr) : null);
const meanMedian = (values) => ({ mean: mean(values), median: median(values) });

/** Every week start from the week of `first` to `last`, both included. */
function weeksBetween(first, last) {
  const out = [];
  for (let w = weekStart(first); w <= last; w = addWeeks(w, 1)) out.push(w);
  return out;
}

/** Closed PRs (drafts excluded) grouped by the week they were closed: [{ week, mean, median: ready → close seconds, n }]. */
export function weeklyCloseTimes() {
  const weeks = {};
  for (const pr of humanPRs().filter((p) => closeTime(p) != null)) (weeks[weekStart(ts(pr.cl))] ||= []).push(closeTime(pr));
  return Object.entries(weeks).sort((a, b) => a[0] - b[0])
    .map(([week, times]) => ({ week: Number(week), ...meanMedian(times), n: times.length }));
}

/** Line comments posted in peer reviews, per week of the review, empty weeks included: [{ week, n }]. */
export function weeklyLineComments() {
  const reviews = D.prs.flatMap(peerReviews);
  if (!reviews.length) return [];
  const counts = {};
  for (const r of reviews) counts[weekStart(r.t)] = (counts[weekStart(r.t)] || 0) + r.lc;
  const times = reviews.map((r) => r.t);
  return weeksBetween(Math.min(...times), Math.max(...times)).map((week) => ({ week, n: counts[week] || 0 }));
}

/**
 * Team-wide numbers: KPI counts, PR sizes, and { mean, median } of ready → first review (reviewed PRs),
 * ready → close (closed PRs, drafts excluded), and line comments and reviews per merged PR (merged = final counts).
 */
export function overview() {
  const prs = humanPRs();
  const merged = prs.filter((p) => p.m);
  const sized = D.prs.filter((p) => p.add != null);
  return {
    reviews: sumBy(D.prs, (pr) => peerReviews(pr).length),
    lineComments: sumBy(D.prs, (pr) => sumBy(peerReviews(pr), (r) => r.lc)),
    unreviewedMerged: merged.filter((p) => p.rv && !peerReviews(p).length).length,
    sizes: Object.fromEntries(SIZES.map(([s]) => [s, sized.filter((p) => sizeOf(p.add + p.del) === s).length])),
    firstReview: meanMedian(prs.map(firstReviewWait).filter((w) => w != null)),
    close: meanMedian(prs.map(closeTime).filter((t) => t != null)),
    lcPerPR: meanMedian(merged.filter((p) => p.rv).map((p) => sumBy(peerReviews(p), (r) => r.lc))),
    reviewsPerPR: meanMedian(merged.filter((p) => p.rv).map((p) => peerReviews(p).length)),
  };
}
