// GitHub API access: REST (paginated, optionally cached) and GraphQL (PR reviews and sizes).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE, REPO, TOKEN } from './env.mjs';
import { fromApiUser, person } from './people.mjs';

let calls = 0;
/** Number of real HTTP requests made so far (cache hits excluded). */
export const apiCalls = () => calls;

const HEADERS = { 'User-Agent': 'festivar-dashboard', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

/**
 * GET a REST endpoint. `url` is relative to /repos/{REPO}/ unless it is absolute.
 * With { all: true }, follows the `Link: rel="next"` header and returns every page concatenated.
 * Responses are cached in CACHE_DIR when it is set.
 */
export async function api(url, { all = false } = {}) {
  if (!url.startsWith('http')) url = `https://api.github.com/repos/${REPO}/${url}`;
  const out = [];
  while (url) {
    let body, next = null;
    const cacheFile = CACHE && path.join(CACHE, `${crypto.createHash('md5').update(url).digest('hex')}.json`);
    if (cacheFile && fs.existsSync(cacheFile)) {
      ({ body, next } = JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    } else {
      calls++;
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...HEADERS } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}: ${(await res.text()).slice(0, 200)}`);
      body = await res.json();
      next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1] || null;
      if (cacheFile) {
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ body, next }));
      }
    }
    if (!all) return body;
    out.push(...body);
    url = next;
  }
  return out;
}

const REVIEW_STATES = { APPROVED: 'A', CHANGES_REQUESTED: 'C', COMMENTED: 'R', DISMISSED: 'D' };
const REVIEWS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { number additions deletions reviews(first: 50) { nodes { author { login __typename } state submittedAt } } }
    }
  }
}`;

/**
 * Size and reviews of every PR through GraphQL (100 PRs per call), which REST would need one call per PR for.
 * Needs GITHUB_TOKEN: GraphQL has no anonymous access. Returns { number: { size, rv: [[login, state, unix]] } }.
 */
export async function prReviews() {
  const [owner, name] = REPO.split('/');
  const out = {};
  let cursor = null;
  do {
    calls++;
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: REVIEWS_QUERY, variables: { owner, name, cursor } }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(json.errors || json).slice(0, 300)}`);
    const page = json.data.repository.pullRequests;
    for (const pr of page.nodes) {
      out[pr.number] = {
        size: pr.additions + pr.deletions,
        rv: pr.reviews.nodes.filter((r) => r.author && r.submittedAt).map((r) => [
          person(r.author.login, null, null, r.author.__typename === 'Bot'), REVIEW_STATES[r.state] || 'R', Date.parse(r.submittedAt) / 1000,
        ]),
      };
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

/** Review state of an open PR from its latest non-comment review per reviewer. */
function reviewState(reviews) {
  const latest = {};
  for (const r of reviews) if (r.state !== 'COMMENTED' && r.user) latest[r.user.login] = r.state;
  const states = Object.values(latest);
  if (states.includes('CHANGES_REQUESTED')) return 'changes';
  if (states.includes('APPROVED')) return 'approved';
  return reviews.length ? 'commented' : 'none';
}

/** CI state of a commit from its check runs. */
function ciState(runs) {
  if (!runs.length) return 'none';
  if (runs.some((r) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion))) return 'failure';
  return runs.some((r) => r.status !== 'completed') ? 'pending' : 'success';
}

/**
 * Details of the open PRs (data.json `openPRs`): changed files always; review and CI state only with a
 * token (2 more calls per PR). Per-PR calls are made for open PRs only, to stay within the API budget.
 */
export async function openPRDetails(pulls) {
  const out = [];
  for (const p of pulls.filter((x) => x.state === 'open')) {
    const files = await api(`pulls/${p.number}/files?per_page=100`, { all: true });
    const review = TOKEN ? reviewState(await api(`pulls/${p.number}/reviews?per_page=100`, { all: true })) : null;
    const ci = TOKEN ? ciState((await api(`commits/${p.head.sha}/check-runs?per_page=100`)).check_runs || []) : null;
    out.push({
      n: p.number, title: p.title, a: fromApiUser(p.user), d: !!p.draft, c: p.created_at, u: p.updated_at,
      branch: p.head.ref, reviewers: (p.requested_reviewers || []).map(fromApiUser), review, ci,
      files: files.map((f) => ({ f: f.filename, s: f.status, add: f.additions, del: f.deletions })),
    });
  }
  return out;
}
