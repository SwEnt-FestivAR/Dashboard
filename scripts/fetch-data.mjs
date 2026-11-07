// Collects data about the FestivAR repository and writes site/data.json.
// Read-only: it only reads a local clone of FestivAR (git log) and the public GitHub API.
//
// Env:
//   FESTIVAR_DIR  path to a full clone of FestivAR (default: ./festivar)
//   REPO          owner/name (default: SwEnt-FestivAR/FestivAR)
//   GITHUB_TOKEN  optional; without it, reviews and CI status of open PRs are skipped
//   OUT           output file (default: site/data.json)
//   CACHE_DIR     optional; caches API responses on disk (handy for local dev)
//
// Output schema (site/data.json). Keys are short on purpose, to keep the file small.
// Dates are ISO strings unless noted "unix" (seconds). Every `a`, `as`, `author`,
// `login` field is a GitHub login and a key of `people`.
//
//   repo, siteRepo   "owner/name" of FestivAR and of this dashboard repo
//   branch           FestivAR default branch (e.g. "main")
//   generatedAt      ISO date of the run; the site uses it as "now"
//   hasToken         false = openPRs[].review and .ci are null
//   people           { login: { login, name, avatar, bot } }
//   commits          [[unix, login, linesAdded, linesDeleted], ...]  (merge commits excluded)
//   prs              [{ n, title, a, s: "open"|"closed", d: draft, c: created, m: merged, cl: closed, u: updated }]
//   issues           [{ n, title, s, r: state_reason, c, cl, a: opener, as: [assignees], ms: milestone title, labels: [{name,color}] }]
//   openPRs          [{ n, title, a, d, c, u, branch, reviewers: [login], review: "none"|"commented"|"changes"|"approved"|null,
//                       ci: "success"|"failure"|"pending"|"none"|null, labels, files: [{f, s, add, del}], screens: ["feature/Key"] }]
//   milestones       [{ title, state, due, open, closed, url, description }]
//   units            one entry per screen, i.e. a Screen/ViewModel pair:
//                    { feature, key, screen: FileInfo|null, viewModel: FileInfo|null, openPRs: [n], tests: { ui: [name], unit: [name] } }
//   FileInfo         on main:     { path, lines, todos, author, created: unix, lastModified: unix, lastAuthor, commits, contributors: [{login, n}] }
//                    only in a PR: { path, inPR: n, author, created: unix, lines, contributors }
//   navigation       { screens: [route names, AppScreens enum order], edges: [{ from, to, kind: "go"|"back" }] }
//                    (see navigationGraph() for how it is read)
//   hotspots         top HOTSPOTS Kotlin files of app/src by commits × lines, most first:
//                    [{ f: path, n: commits touching it (merges excluded), lines, authors: [{login, n}] (most first) }]
//
// How screens are found: any file matching UI_RE, i.e. app/src/main/java/**/ui/<feature>/**/<Key>(Screen|ViewModel).kt.
// <feature> is the first folder after ui/, <Key> is the shared prefix that pairs a Screen with its ViewModel
// (CreateTaskScreen.kt + CreateTaskViewModel.kt -> unit "task/CreateTask").

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO = process.env.REPO || 'SwEnt-FestivAR/FestivAR';
const SRC = process.env.FESTIVAR_DIR || 'festivar';
const OUT = process.env.OUT || 'site/data.json';
const TOKEN = process.env.GITHUB_TOKEN || '';
const CACHE = process.env.CACHE_DIR || '';
// Captures: [1] feature folder, [2] screen key, [3] "Screen" | "ViewModel"
const UI_RE = /^app\/src\/main\/java\/.*\/ui\/([^/]+)\/(?:.*\/)?([A-Za-z0-9]+?)(Screen|ViewModel)\.kt$/;
const HOTSPOTS = 40; // number of hotspot files kept in data.json
// ui/ subfolders that hold shared code, not screens
const SKIP_FEATURES = new Set(['components', 'theme']);
// Manual identity fixes: { "git name or email": "github-login" }
const ALIASES = fs.existsSync('aliases.json') ? JSON.parse(fs.readFileSync('aliases.json', 'utf8')) : {};

/** Runs a git command inside the FestivAR clone and returns stdout. */
const git = (...args) => execFileSync('git', ['-C', SRC, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

// ---------- GitHub API ----------
let apiCalls = 0;
/**
 * GET a GitHub REST endpoint. `url` is relative to /repos/{REPO}/ unless it is absolute.
 * With { all: true }, follows the `Link: rel="next"` header and returns every page concatenated.
 * Responses are cached in CACHE_DIR when it is set.
 */
async function api(url, { all = false } = {}) {
  if (!url.startsWith('http')) url = `https://api.github.com/repos/${REPO}/${url}`;
  const out = [];
  while (url) {
    let body, next = null;
    const cacheFile = CACHE && path.join(CACHE, crypto.createHash('md5').update(url).digest('hex') + '.json');
    if (cacheFile && fs.existsSync(cacheFile)) {
      ({ body, next } = JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    } else {
      apiCalls++;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'festivar-dashboard',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}: ${(await res.text()).slice(0, 200)}`);
      body = await res.json();
      const m = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '');
      next = m ? m[1] : null;
      if (cacheFile) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify({ body, next })); }
    }
    if (!all) return body;
    out.push(...body);
    url = next;
  }
  return out;
}

// ---------- People ----------
// Everyone is identified by GitHub login. git only knows names and emails, so resolve()
// maps them onto logins (see its comment for the order of the rules).
const people = {}; // login -> {login, name, avatar, bot}
const emailToLogin = {}, nameToLogin = {};
/** Registers (or enriches) a person and returns their login. */
function person(login, name, avatar, bot) {
  if (!login) return null;
  const p = (people[login] ||= { login, name: name || login, avatar: avatar || `https://github.com/${login}.png?size=96`, bot: !!bot });
  if (name && p.name === login) p.name = name;
  if (bot || /\[bot\]$/i.test(login)) p.bot = true;
  return login;
}
function fromApiUser(u) { return u ? person(u.login, null, u.avatar_url, u.type === 'Bot') : null; }
/**
 * Maps a git author (name, email, commit sha) to a GitHub login, trying in order:
 *  1. the login GitHub attached to that commit (API commit list, main branch only)
 *  2. a GitHub noreply email (12345+login@users.noreply.github.com)
 *  3. an email or name already seen on a resolved commit
 *  4. aliases.json (email or name)
 *  5. a unique known person whose first name equals this git name ("Florian" -> "Florian Chatelain")
 *  6. otherwise a new pseudo-person named after the git name
 * If a contributor shows up twice on the site, add their email to aliases.json.
 */
function resolve(name, email, sha, shaToLogin) {
  if (sha && shaToLogin[sha]) return shaToLogin[sha];
  const m = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email || '');
  if (m) return person(m[1], name);
  if (emailToLogin[email?.toLowerCase()]) return emailToLogin[email.toLowerCase()];
  if (nameToLogin[name?.toLowerCase()]) return nameToLogin[name.toLowerCase()];
  const alias = ALIASES[email?.toLowerCase()] || ALIASES[name];
  if (alias) return person(alias);
  // "Florian" -> the only known person whose name starts with "Florian"
  const lower = (name || '').toLowerCase();
  const cands = Object.values(people).filter((p) => !p.bot && p.name.toLowerCase().split(/\s+/)[0] === lower);
  if (cands.length === 1) return (nameToLogin[lower] = cands[0].login);
  return person(name, name, `https://github.com/identicons/${encodeURIComponent(name)}.png`, /bot/i.test(name));
}

/**
 * Navigation graph read from FestivAR's navigation/ folder, following its conventions:
 *  - routes = entries of `enum class AppScreens { … }`
 *  - edges come from `class <Screen>Navigator` files: every `navigate(AppScreens.X…)` is a "go" edge and every
 *    `popBackStack(AppScreens.X…)` a "back" edge from <Screen> to X. Route helpers like `AppScreens.taskDetails(id)`
 *    map to `TaskDetails`. navigate() calls written directly in the NavGraph files are not read.
 */
function navigationGraph(allFiles) {
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
  const navFiles = allFiles.filter((f) => /^app\/src\/main\/.*\/navigation\/.*\.kt$/.test(f));
  const screens = [];
  const edges = new Map();
  for (const f of navFiles) {
    const text = read(f);
    const enumBody = /enum class AppScreens\s*\{([^;}]*)/.exec(text);
    if (enumBody) screens.push(...enumBody[1].split(',').map((s) => s.trim()).filter(Boolean));
    const from = /class (\w+)Navigator\b/.exec(text)?.[1];
    if (!from) continue;
    for (const [, call, target] of text.matchAll(/\b(navigate|popBackStack)\(\s*AppScreens\.(\w+)/g)) {
      const to = target[0].toUpperCase() + target.slice(1);
      const kind = call === 'navigate' ? 'go' : 'back';
      if (to !== from) edges.set(`${from}>${to}>${kind}`, { from, to, kind });
    }
  }
  return { screens, edges: [...edges.values()] };
}

async function main() {
  console.log(`Repo ${REPO}, clone ${SRC}, token: ${TOKEN ? 'yes' : 'no'}`);
  const defaultBranch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();

  // ---- API: commits (for sha -> login), PRs, issues, milestones
  const [apiCommits, pulls, issuesRaw, milestones] = await Promise.all([
    api(`commits?sha=${defaultBranch}&per_page=100`, { all: true }),
    api('pulls?state=all&per_page=100', { all: true }),
    api('issues?state=all&per_page=100', { all: true }),
    api('milestones?state=all&per_page=100', { all: true }),
  ]);
  const shaToLogin = {};
  for (const c of apiCommits) {
    const login = fromApiUser(c.author);
    if (!login) continue;
    shaToLogin[c.sha] = login;
    if (c.commit?.author?.email) emailToLogin[c.commit.author.email.toLowerCase()] = login;
    if (c.commit?.author?.name) { nameToLogin[c.commit.author.name.toLowerCase()] ||= login; if (people[login].name === login) people[login].name = c.commit.author.name; }
  }

  // ---- git: commits with numstat
  const log = git('log', defaultBranch, '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at', '--numstat');
  const commits = [];
  const fileChanges = {}; // path -> { n: commits touching it, authors: { login: n } }, used for hotspots
  for (const chunk of log.split('\x1e').slice(1)) {
    const [head, ...rest] = chunk.split('\n');
    const [sha, parents, name, email, at] = head.split('\x1f');
    if (parents.split(' ').length > 1) continue; // skip merge commits
    const login = resolve(name, email, sha, shaToLogin);
    let add = 0, del = 0;
    for (const line of rest) {
      const [a, d, file] = line.split('\t');
      if (!file) continue;
      if (/^\d+$/.test(a)) { add += +a; del += +d; }
      const fc = (fileChanges[file] ||= { n: 0, authors: {} });
      fc.n++;
      fc.authors[login] = (fc.authors[login] || 0) + 1;
    }
    commits.push([+at, login, add, del]);
  }

  // ---- PRs
  const prs = pulls.map((p) => ({
    n: p.number, title: p.title, a: fromApiUser(p.user), s: p.state, d: !!p.draft,
    c: p.created_at, m: p.merged_at, cl: p.closed_at, u: p.updated_at,
  }));

  // ---- Issues (the issues endpoint also returns PRs)
  const issues = issuesRaw.filter((i) => !i.pull_request).map((i) => ({
    n: i.number, title: i.title, s: i.state, r: i.state_reason, c: i.created_at, cl: i.closed_at,
    a: fromApiUser(i.user), as: (i.assignees || []).map(fromApiUser), ms: i.milestone?.title || null,
    labels: (i.labels || []).map((l) => ({ name: l.name, color: l.color })),
  }));

  // ---- Open PR details
  const openPRs = [];
  for (const p of pulls.filter((p) => p.state === 'open')) {
    const files = await api(`pulls/${p.number}/files?per_page=100`, { all: true });
    let review = null, ci = null;
    if (TOKEN) {
      const reviews = await api(`pulls/${p.number}/reviews?per_page=100`, { all: true });
      const last = {};
      for (const r of reviews) if (r.state !== 'COMMENTED' && r.user) last[r.user.login] = r.state;
      const states = Object.values(last);
      review = states.includes('CHANGES_REQUESTED') ? 'changes' : states.includes('APPROVED') ? 'approved' : reviews.length ? 'commented' : 'none';
      const runs = (await api(`commits/${p.head.sha}/check-runs?per_page=100`)).check_runs || [];
      if (!runs.length) ci = 'none';
      else if (runs.some((r) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion))) ci = 'failure';
      else if (runs.some((r) => r.status !== 'completed')) ci = 'pending';
      else ci = 'success';
    }
    openPRs.push({
      n: p.number, title: p.title, a: fromApiUser(p.user), d: !!p.draft, c: p.created_at, u: p.updated_at,
      branch: p.head.ref, reviewers: (p.requested_reviewers || []).map(fromApiUser), review, ci,
      labels: (p.labels || []).map((l) => ({ name: l.name, color: l.color })),
      files: files.map((f) => ({ f: f.filename, s: f.status, add: f.additions, del: f.deletions })),
    });
  }

  // ---- Screens / ViewModels
  const allFiles = git('ls-files').split('\n').filter(Boolean);
  const testFiles = allFiles.filter((f) => /\/(test|androidTest)\/.*\/ui\/.*Test\.kt$/.test(f));
  const units = {}; // feature/key -> unit
  const unitFor = (feature, key) => (units[`${feature}/${key}`] ||= { feature, key, screen: null, viewModel: null, openPRs: [] });

  /** History of one file on main (--follow tracks renames). The oldest commit gives the initial author. */
  function fileInfo(file) {
    const out = git('log', defaultBranch, '--follow', '--format=%H%x1f%an%x1f%ae%x1f%at', '--', file).trim().split('\n').filter(Boolean)
      .map((l) => { const [sha, name, email, at] = l.split('\x1f'); return { login: resolve(name, email, sha, shaToLogin), at: +at }; });
    const contributors = {};
    for (const c of out) contributors[c.login] = (contributors[c.login] || 0) + 1;
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    return {
      path: file, lines: text.split('\n').length, todos: (text.match(/\bTODO\b/g) || []).length,
      author: out.at(-1)?.login, created: out.at(-1)?.at, lastModified: out[0]?.at, lastAuthor: out[0]?.login,
      commits: out.length, contributors: Object.entries(contributors).sort((a, b) => b[1] - a[1]).map(([login, n]) => ({ login, n })),
    };
  }

  for (const f of allFiles) {
    const m = UI_RE.exec(f);
    if (!m || SKIP_FEATURES.has(m[1])) continue;
    const u = unitFor(m[1], m[2]);
    u[m[3] === 'Screen' ? 'screen' : 'viewModel'] = fileInfo(f);
  }
  // Files that only exist in open PRs, and PRs touching existing files
  for (const pr of openPRs) {
    pr.screens = [];
    for (const file of pr.files) {
      const m = UI_RE.exec(file.f);
      if (!m || SKIP_FEATURES.has(m[1])) continue;
      const u = unitFor(m[1], m[2]);
      const slot = m[3] === 'Screen' ? 'screen' : 'viewModel';
      if (!u[slot] && file.s !== 'removed') u[slot] = { path: file.f, inPR: pr.n, author: pr.a, created: Date.parse(pr.c) / 1000, lines: file.add, contributors: [{ login: pr.a, n: 1 }] };
      if (!u.openPRs.includes(pr.n)) u.openPRs.push(pr.n);
      if (!pr.screens.includes(`${m[1]}/${m[2]}`)) pr.screens.push(`${m[1]}/${m[2]}`);
    }
  }
  // Tests are matched by file name prefix: CreateTaskScreenTest, CreateTaskViewModelTest... all belong to "CreateTask".
  // androidTest/ = UI tests, test/ = unit tests.
  for (const u of Object.values(units)) {
    const matching = testFiles.filter((t) => path.basename(t).startsWith(u.key));
    u.tests = {
      ui: matching.filter((t) => t.includes('/androidTest/')).map((t) => path.basename(t, '.kt')),
      unit: matching.filter((t) => t.includes('/test/')).map((t) => path.basename(t, '.kt')),
    };
  }

  // Hotspots: current Kotlin files ranked by (commits touching them) × (current lines). Renamed paths
  // count only under their current name.
  const hotspots = allFiles
    .filter((f) => f.startsWith('app/src/') && f.endsWith('.kt') && fileChanges[f])
    .map((f) => ({
      f, n: fileChanges[f].n, lines: fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').length,
      authors: Object.entries(fileChanges[f].authors).sort((a, b) => b[1] - a[1]).map(([login, n]) => ({ login, n })),
    }))
    .sort((a, b) => b.n * b.lines - a.n * a.lines)
    .slice(0, HOTSPOTS);

  const data = {
    navigation: navigationGraph(allFiles),
    repo: REPO, siteRepo: process.env.GITHUB_REPOSITORY || 'SwEnt-FestivAR/General-information', branch: defaultBranch, generatedAt: new Date().toISOString(), hasToken: !!TOKEN,
    people, commits, prs, issues, openPRs,
    milestones: milestones.map((m) => ({ title: m.title, state: m.state, due: m.due_on, open: m.open_issues, closed: m.closed_issues, url: m.html_url, description: m.description })),
    units: Object.values(units).sort((a, b) => a.feature.localeCompare(b.feature) || a.key.localeCompare(b.key)),
    hotspots,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`Wrote ${OUT}: ${commits.length} commits, ${prs.length} PRs, ${issues.length} issues, ${data.units.length} screen units, ${apiCalls} API calls`);
}

main().catch((e) => { console.error(e); process.exit(1); });
