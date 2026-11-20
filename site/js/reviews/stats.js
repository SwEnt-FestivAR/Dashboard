// Per-person review statistics, computed from D.prs (rv and rq exist only when the fetch had a token).
// Self-reviews, requests to oneself and bots are ignored everywhere. Times measured from a PR's opening start
// when it was ready for review (readyAt), so time spent as a draft is not counted.

import { mean, median, ts } from '../core/utils.js';
import { D, P } from '../core/store.js';

export const isHuman = (login) => login && !P(login).bot;

/**
 * Unix time from which a PR waits for review: when it was marked ready (rdy) if it was opened as a draft, else
 * its creation. Null while it is a draft, or if it was closed as one: those PRs never waited for a review.
 */
export const readyAt = (pr) => (pr.d ? null : pr.rdy ?? ts(pr.c));

/** Reviews of a PR by people other than its author, oldest first: [{ login, state, t, lc: line comments }]. */
export function peerReviews(pr) {
  return (pr.rv || [])
    .filter(([login]) => login !== pr.a && isHuman(login))
    .map(([login, state, t, lc = 0]) => ({ login, state, t, lc }))
    .sort((a, b) => a.t - b.t);
}

/** Times (unix) of the peer approvals of a PR, oldest first. Empty without review data. */
export const approvalTimes = (pr) => peerReviews(pr).filter((r) => r.state === 'A').map((r) => r.t);

/**
 * Who reviews a PR (number n), as [{ login, state }]: everyone who reviewed it with their latest verdict
 * ("A" approved, "C" changes requested, "R" commented — a later comment does not cancel a verdict), plus the
 * reviewers GitHub still waits for ("requested", which wins: a re-requested review is pending again).
 * Submitted reviews need the token; requested reviewers are always known for open PRs.
 */
export function reviewersOf(n) {
  const latest = {};
  for (const r of peerReviews(D.prs.find((p) => p.n === n) || {})) {
    if (r.state === 'D') continue; // dismissed reviews don't count
    latest[r.login] = r.state === 'R' && latest[r.login] ? latest[r.login] : r.state;
  }
  for (const login of D.openPRs.find((p) => p.n === n)?.reviewers || []) latest[login] = 'requested';
  return Object.entries(latest).map(([login, state]) => ({ login, state }));
}

/**
 * Seconds from a PR being ready for review to its first peer review (null when never reviewed or still a draft).
 * A review already given while it was a draft counts as no wait (0).
 */
export const firstReviewWait = (pr) => {
  const first = peerReviews(pr)[0];
  return first && readyAt(pr) != null ? Math.max(0, first.t - readyAt(pr)) : null;
};

/**
 * Answer times of the review requests of a PR: [{ login, wait }], where wait = seconds from the request to the
 * requested person's first review submitted after it. Requests never answered are left out (no time to measure).
 */
function requestWaits(pr) {
  const reviews = peerReviews(pr);
  return (pr.rq || []).filter(([login]) => login !== pr.a && isHuman(login)).flatMap(([login, t]) => {
    const answer = reviews.find((r) => r.login === login && r.t >= t);
    return answer ? [{ login, wait: answer.t - t }] : [];
  });
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

/** The author whose PRs `login` reviewed the most, from a reviewMatrix() (null when none). */
const topReviewee = (m, login) => Object.entries(m[login] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

/**
 * Per person, sorted by reviews submitted: reviews, distinct PRs of others reviewed, line comments (total and
 * per review), median wait before the first review of their own PRs, mean ready → merge of their own PRs and
 * of the PRs of others they reviewed, who they review most, and mean / median time from a review request
 * to their review.
 */
export function reviewerStats() {
  const st = {};
  const get = (login) => (st[login] ||= { login, reviews: 0, reviewed: 0, lc: 0, waits: [], ownCycles: [], reviewedCycles: [], answers: [] });
  for (const pr of D.prs.filter((p) => isHuman(p.a))) {
    const author = get(pr.a);
    const cycle = pr.m && readyAt(pr) != null ? ts(pr.m) - readyAt(pr) : null;
    if (cycle != null) author.ownCycles.push(cycle);
    const wait = firstReviewWait(pr);
    if (wait != null) author.waits.push(wait);
    const reviews = peerReviews(pr);
    for (const r of reviews) {
      get(r.login).reviews++;
      get(r.login).lc += r.lc;
    }
    for (const login of new Set(reviews.map((r) => r.login))) {
      get(login).reviewed++;
      if (cycle != null) get(login).reviewedCycles.push(cycle);
    }
    for (const { login, wait: w } of requestWaits(pr)) get(login).answers.push(w);
  }
  const m = reviewMatrix();
  return Object.values(st).map((s) => ({
    login: s.login, reviews: s.reviews, reviewed: s.reviewed, lineComments: s.lc,
    lcPerReview: s.reviews ? s.lc / s.reviews : null,
    medianWait: median(s.waits), ownCycle: mean(s.ownCycles), reviewedCycle: mean(s.reviewedCycles),
    topReviewee: topReviewee(m, s.login), meanAnswer: mean(s.answers), medianAnswer: median(s.answers),
  })).sort((a, b) => b.reviews - a.reviews || b.reviewed - a.reviewed);
}
