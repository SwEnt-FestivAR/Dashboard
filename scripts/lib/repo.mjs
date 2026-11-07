// Data read from the FestivAR clone with git and the file system: commits, hotspots, navigation graph.

import fs from 'node:fs';
import path from 'node:path';
import { SRC, git } from './env.mjs';
import { resolve } from './people.mjs';

const HOTSPOTS = 40; // number of hotspot files kept in data.json

export const readFile = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
export const countLines = (text) => text.split('\n').length;

/** [{ login, n }] sorted by n, from { login: n }. */
export const ranked = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([login, n]) => ({ login, n }));

const HALF_LIFE_DAYS = 14; // a change counts half as much after two weeks (two sprints)

/**
 * Commits of the default branch with their line stats (merge commits excluded), plus, per file, what the
 * hotspots need: commits touching it, by whom, when last, and its recent activity `heat`.
 * heat = Σ over its commits of 0.5^(age / HALF_LIFE_DAYS) × log2(1 + lines changed in the file), where the
 * age is measured from the newest commit (so the score does not depend on when the script runs).
 * Returns { commits: [[unix, login, added, deleted]], fileChanges: { path: { n, heat, last, authors: { login: n } } } }.
 */
export function readCommits(branch) {
  const log = git('log', branch, '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at', '--numstat');
  const commits = [];
  const fileChanges = {};
  let newest = null;
  for (const chunk of log.split('\x1e').slice(1)) {
    const [head, ...stats] = chunk.split('\n');
    const [sha, parents, name, email, at] = head.split('\x1f');
    if (parents.split(' ').length > 1) continue;
    const t = Number(at);
    newest ??= t; // git log lists the newest commit first
    const decay = 0.5 ** ((newest - t) / 86400 / HALF_LIFE_DAYS);
    const login = resolve(name, email, sha);
    let add = 0, del = 0;
    for (const line of stats) {
      const [a, d, file] = line.split('\t');
      if (!file) continue;
      const changed = /^\d+$/.test(a) ? Number(a) + Number(d) : 0; // binary files show "-"
      add += changed && Number(a);
      del += changed && Number(d);
      const fc = (fileChanges[file] ||= { n: 0, heat: 0, last: t, authors: {} });
      fc.n++;
      fc.heat += decay * Math.log2(1 + changed);
      fc.authors[login] = (fc.authors[login] || 0) + 1;
    }
    commits.push([t, login, add, del]);
  }
  return { commits, fileChanges };
}

/**
 * Indentation-based complexity, a standard language-agnostic proxy (A. Tornhill, "Your Code as a Crime
 * Scene"): the sum of the indentation levels of the code lines. Nested if/when/lambdas weigh more than
 * flat code, which plain line counts miss. Blank lines, comments and imports are ignored; Kotlin uses
 * 2- or 4-space indents, counted as levels of 2 spaces.
 */
function complexity(text) {
  let total = 0;
  for (const line of text.split('\n')) {
    const code = line.trimStart();
    if (!code || /^(\/\/|\/\*|\*|import |package )/.test(code)) continue;
    total += Math.floor((line.length - code.length) / 2);
  }
  return total;
}

/**
 * Current Kotlin files of app/src that change a lot recently AND are complex: score = heat × log2(1 + complexity).
 * The log keeps big-but-quiet files from dominating: activity matters more than size. Renamed files count
 * only under their current name.
 */
export function hotspots(allFiles, fileChanges) {
  return allFiles
    .filter((f) => f.startsWith('app/src/') && f.endsWith('.kt') && fileChanges[f])
    .map((f) => {
      const text = readFile(f), fc = fileChanges[f], cx = complexity(text);
      return {
        f, n: fc.n, heat: Math.round(fc.heat * 10) / 10, complexity: cx, lines: countLines(text), last: fc.last,
        score: Math.round(fc.heat * Math.log2(1 + cx)), authors: ranked(fc.authors),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, HOTSPOTS);
}

/**
 * Navigation graph read from FestivAR's navigation/ folder, following its conventions:
 *  - routes = entries of `enum class AppScreens { … }`
 *  - edges come from `class <Screen>Navigator` files: every `navigate(AppScreens.X…)` is a "go" edge and every
 *    `popBackStack(AppScreens.X…)` a "back" edge from <Screen> to X. Route helpers like `AppScreens.taskDetails(id)`
 *    map to `TaskDetails`. navigate() calls written directly in the NavGraph files are not read.
 */
export function navigationGraph(allFiles) {
  const screens = [];
  const edges = new Map();
  for (const f of allFiles.filter((x) => /^app\/src\/main\/.*\/navigation\/.*\.kt$/.test(x))) {
    const text = readFile(f);
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
