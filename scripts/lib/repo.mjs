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

/**
 * Commits of the default branch with their line stats (merge commits excluded), plus, per file, how many
 * commits touched it and by whom (for hotspots).
 * Returns { commits: [[unix, login, added, deleted]], fileChanges: { path: { n, authors: { login: n } } } }.
 */
export function readCommits(branch) {
  const log = git('log', branch, '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at', '--numstat');
  const commits = [];
  const fileChanges = {};
  for (const chunk of log.split('\x1e').slice(1)) {
    const [head, ...stats] = chunk.split('\n');
    const [sha, parents, name, email, at] = head.split('\x1f');
    if (parents.split(' ').length > 1) continue;
    const login = resolve(name, email, sha);
    let add = 0, del = 0;
    for (const line of stats) {
      const [a, d, file] = line.split('\t');
      if (!file) continue;
      if (/^\d+$/.test(a)) { add += Number(a); del += Number(d); } // binary files show "-"
      const fc = (fileChanges[file] ||= { n: 0, authors: {} });
      fc.n++;
      fc.authors[login] = (fc.authors[login] || 0) + 1;
    }
    commits.push([Number(at), login, add, del]);
  }
  return { commits, fileChanges };
}

/** Current Kotlin files of app/src ranked by (commits touching them) × (current lines). Renamed paths count only under their current name. */
export function hotspots(allFiles, fileChanges) {
  return allFiles
    .filter((f) => f.startsWith('app/src/') && f.endsWith('.kt') && fileChanges[f])
    .map((f) => ({ f, n: fileChanges[f].n, lines: countLines(readFile(f)), authors: ranked(fileChanges[f].authors) }))
    .sort((a, b) => b.n * b.lines - a.n * a.lines)
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
