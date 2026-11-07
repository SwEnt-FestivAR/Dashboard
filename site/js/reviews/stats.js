// Review and PR-flow statistics, computed from D.prs (rv and size exist only when the fetch had a token).
// Self-reviews and bots are ignored everywhere.

import { median, ts, weekStart } from '../core/utils.js';
import { D, P } from '../core/store.js';

/** PR size buckets, by lines added + deleted. */
export const SIZES = [['S', 100], ['M', 400], ['L', 1000], ['XL', Infinity]];
const sizeOf = (lines) => SIZES.find(([, max]) => lines < max)[0];

const isHuman = (login) => login && !P(login).bot;

/** Reviews of a PR by people other than its author, oldest first: [{ login, state, t }]. */
function peerReviews(pr) {
  return (pr.rv || [])
    .filter(([login]) => login !== pr.a && isHuman(login))
    .map(([login, state, t]) => ({ login, state, t }))
    .sort((a, b) => a.t - b.t);
}

/** Times (unix) of the peer approvals of a PR, oldest first. Empty without review data. */
export const approvalTimes = (pr) => peerReviews(pr).filter((r) => r.state === 'A').map((r) => r.t);

/** Logins of the people who approved a PR. */
export const approvers = (pr) => [...new Set(peerReviews(pr).filter((r) => r.state === 'A').map((r) => r.login))];

/** Seconds from opening a PR to its first peer review (null when never reviewed). */
const firstReviewWait = (pr) => {
  const first = peerReviews(pr)[0];
  return first ? first.t - ts(pr.c) : null;
};

/**
 * Per person: PRs reviewed (distinct PRs of others), reviews submitted, approvals, change requests,
 * PRs authored and the median wait before the first review of their own PRs. Sorted by PRs reviewed.
 */
export function reviewerStats() {
  const st = {};
  const get = (login) => (st[login] ||= { login, reviewed: 0, reviews: 0, approvals: 0, changes: 0, authored: 0, waits: [] });
  for (const pr of D.prs.filter((p) => isHuman(p.a))) {
    const author = get(pr.a);
    author.authored++;
    const wait = firstReviewWait(pr);
    if (wait != null) author.waits.push(wait);
    const reviews = peerReviews(pr);
    for (const login of new Set(reviews.map((r) => r.login))) get(login).reviewed++;
    for (const r of reviews) {
      const s = get(r.login);
      s.reviews++;
      if (r.state === 'A') s.approvals++;
      if (r.state === 'C') s.changes++;
    }
  }
  return Object.values(st)
    .map((s) => ({ ...s, medianWait: median(s.waits) }))
    .sort((a, b) => b.reviewed - a.reviewed);
}

/** matrix[reviewer][author] = number of PRs of `author` reviewed by `reviewer`. */
export function reviewMatrix() {
  const m = {};
  for (const pr of D.prs) {
    for (const login of new Set(peerReviews(pr).map((r) => r.login))) {
      m[login] ||= {};
      m[login][pr.a] = (m[login][pr.a] || 0) + 1;
    }
  }
  return m;
}

/** Merged PRs grouped by the week they were merged: [{ week, cycle: median open→merge seconds, n }]. */
export function weeklyCycleTime() {
  const weeks = {};
  for (const pr of D.prs.filter((p) => p.m && isHuman(p.a))) {
    const w = weekStart(ts(pr.m));
    (weeks[w] ||= []).push(ts(pr.m) - ts(pr.c));
  }
  return Object.entries(weeks).sort((a, b) => a[0] - b[0]).map(([week, cycles]) => ({ week: Number(week), cycle: median(cycles), n: cycles.length }));
}

/** Overall numbers for the KPI row. */
export function overview() {
  const merged = D.prs.filter((p) => p.m && isHuman(p.a));
  const waits = D.prs.map(firstReviewWait).filter((w) => w != null);
  const sized = D.prs.filter((p) => p.size != null);
  return {
    reviews: D.prs.reduce((t, pr) => t + peerReviews(pr).length, 0),
    medianWait: median(waits),
    medianCycle: median(merged.map((p) => ts(p.m) - ts(p.c))),
    unreviewedMerged: merged.filter((p) => p.rv && !peerReviews(p).length).length,
    sizes: Object.fromEntries(SIZES.map(([s]) => [s, sized.filter((p) => sizeOf(p.size) === s).length])),
  };
}
