// Collects data about the FestivAR repository and writes site/data.json.
// Read-only: it only reads a local clone of FestivAR (git) and the GitHub API.
// This file documents the output and orchestrates; the work is done by the modules of scripts/lib/:
//   env.mjs (configuration, git helper) · people.mjs (identities) · github.mjs (REST + GraphQL)
//   repo.mjs (commits, hotspots) · files.mjs (file graph) · navigation.mjs (navigation graph) · screens.mjs (screen units)
//
// Env:
//   FESTIVAR_DIR  path to a full clone of FestivAR, with all its branches (default: ./festivar)
//   REPO          owner/name (default: SwEnt-FestivAR/FestivAR)
//   GITHUB_TOKEN  optional; without it, PR reviews, PR sizes and CI status are skipped
//   OUT           output file (default: site/data.json)
//   CACHE_DIR     optional; caches REST responses on disk (handy for local dev)
//
// Output schema (site/data.json). Keys are short on purpose, to keep the file small.
// Dates are ISO strings unless noted "unix" (seconds). Every `a`, `as`, `author`,
// `login` field is a GitHub login and a key of `people`.
//
//   repo, siteRepo   "owner/name" of FestivAR and of this dashboard repo
//   branch           FestivAR default branch (e.g. "main")
//   generatedAt      ISO date of the run; the site uses it as "now"
//   hasToken         false = openPRs[].review and .ci are null, prs[].add, .del, .rv and .rq are missing
//   people           { login: { login, name, avatar, bot } }
//   commits          [[unix, login, linesAdded, linesDeleted, landed], ...]  (merge commits excluded; landed = unix when it
//                    reached the default branch, i.e. when its PR was merged, see landingTimes() in lib/repo.mjs)
//   prs              [{ n, title, a, s: "open"|"closed", d: draft, c: created, m: merged, cl: closed (merged or not),
//                       add, del: lines added / deleted,
//                       rv: [[reviewer, "A"pproved|"C"hanges requested|"R" commented|"D"ismissed, unix, line comments of the review]],
//                       rq: [[requested reviewer, unix of the request]],
//                       rdy: unix when a PR opened as a draft was first marked ready for review (absent if never a draft) }]
//                    add, del, rv, rq and rdy only exist when hasToken (they come from GraphQL, see prReviews() in lib/github.mjs)
//   issues           [{ n, title, s, r: state_reason, c: created, cl: closed, as: [assignees], ms: milestone title,
//                       labels: [{name, color}] }]
//   openPRs          [{ n, title, a, d, c, u: updated, branch, reviewers: [login], review: "none"|"commented"|"changes"|"approved"|null,
//                       ci: "success"|"failure"|"pending"|"none"|null, files: [{f, s, add, del}], screens: ["feature/Key"] }]
//   milestones       [{ title, state, due }] (open / closed counts are computed by the site from `issues`)
//   units            one entry per screen, i.e. a Screen/ViewModel pair (or a Fragment, in `screen`, with no ViewModel):
//                    { feature, key, screen: FileInfo|null, viewModel: FileInfo|null, openPRs: [n], branches: [branch names touching it],
//                      tests: { ui: [name], unit: [name] } }
//   FileInfo         on main:     { path, lines, todos, author, created: unix, lastModified: unix, lastAuthor, commits, contributors: [{login, n}] }
//                    only in a PR: { path, inPR: n, author, created: unix, lines, contributors }
//                    only in a branch (no open PR): { path, inBranch: name, author, created: unix, lines, contributors }
//   navigation       { screens: [route names, AppScreens enum order], edges: [{ from, to, kind: "go"|"back" }],
//                      bar: { tabs: [[bottom bar tab, route it opens]], on: [routes that show the bottom bar]} }
//                    (see navigationGraph() in lib/navigation.mjs for how it is read)
//   hotspots         top 40 Kotlin files of app/src by score, most first (see hotspots() in lib/repo.mjs):
//                    [{ f: path, n: commits touching it (merges excluded), heat: recent activity, uses: other production files
//                       using it, lines, last: unix of its last change, score: 0–100, authors: [{login, n}] (most first) }]
//
//   files            every Kotlin file of app/src: { p: [paths], l: [lines], e: [[i, j]] }, where i, j are indexes in p and
//                    the edge means "file i mentions the class of file j" (see fileGraph() in lib/files.mjs)
//
// How screens are found (lib/screens.mjs): any file matching UI_RE, i.e.
// app/src/main/java/**/ui/<feature>/**/<Key>(Screen|ViewModel|Fragment).kt.
// <feature> is the first folder after ui/, <Key> is the shared prefix that pairs a Screen with its ViewModel
// (CreateTaskScreen.kt + CreateTaskViewModel.kt -> unit "task/CreateTask").
// A <Key>Fragment.kt is a whole screen on its own (ui/settings/SettingsFragment.kt -> unit "settings/Settings").

import fs from 'node:fs';
import path from 'node:path';
import { OUT, REPO, SITE_REPO, SRC, TOKEN, git } from './lib/env.mjs';
import { fromApiUser, learnFromApiCommits, people } from './lib/people.mjs';
import { api, apiCalls, openPRDetails, prReviews } from './lib/github.mjs';
import { fileGraph } from './lib/files.mjs';
import { navigationGraph } from './lib/navigation.mjs';
import { hotspots, readCommits } from './lib/repo.mjs';
import { buildUnits } from './lib/screens.mjs';

async function main() {
  console.log(`Repo ${REPO}, clone ${SRC}, token: ${TOKEN ? 'yes' : 'no'}`);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();

  const [apiCommits, pulls, issuesRaw, milestones] = await Promise.all([
    api(`commits?sha=${branch}&per_page=100`, { all: true }),
    api('pulls?state=all&per_page=100', { all: true }),
    api('issues?state=all&per_page=100', { all: true }),
    api('milestones?state=all&per_page=100', { all: true }),
  ]);
  learnFromApiCommits(apiCommits); // must run before anything resolves git authors

  const { commits, fileChanges } = readCommits(branch);
  const reviews = TOKEN ? await prReviews() : {};
  const prs = pulls.map((p) => ({
    n: p.number, title: p.title, a: fromApiUser(p.user), s: p.state, d: !!p.draft, c: p.created_at, m: p.merged_at, cl: p.closed_at,
    ...reviews[p.number],
  }));
  const issues = issuesRaw.filter((i) => !i.pull_request).map((i) => ({ // the issues endpoint also returns PRs
    n: i.number, title: i.title, s: i.state, r: i.state_reason, c: i.created_at, cl: i.closed_at,
    as: (i.assignees || []).map(fromApiUser), ms: i.milestone?.title || null,
    labels: (i.labels || []).map((l) => ({ name: l.name, color: l.color })),
  }));
  const openPRs = await openPRDetails(pulls);
  const allFiles = git('ls-files').split('\n').filter(Boolean);
  const files = fileGraph(allFiles);

  const data = {
    repo: REPO, siteRepo: SITE_REPO, branch, generatedAt: new Date().toISOString(), hasToken: Boolean(TOKEN),
    people, commits, prs, issues, openPRs,
    milestones: milestones.map((m) => ({ title: m.title, state: m.state, due: m.due_on })),
    units: buildUnits(allFiles, openPRs, branch),
    navigation: navigationGraph(allFiles),
    hotspots: hotspots(files, fileChanges),
    files,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  const counts = `${commits.length} commits, ${prs.length} PRs, ${issues.length} issues, ${data.units.length} screen units`;
  console.log(`Wrote ${OUT}: ${counts}, ${apiCalls()} API calls`);
}

main().catch((e) => { console.error(e); process.exit(1); });
