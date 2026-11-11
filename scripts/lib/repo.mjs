// Data read from the FestivAR clone with git and the file system: commits and hotspots.

import fs from 'node:fs';
import path from 'node:path';
import { SRC, git } from './env.mjs';
import { resolve } from './people.mjs';

const HOTSPOTS = 40; // number of hotspot files kept in data.json

/** Text of a file of the FestivAR clone (path relative to its root). */
export const readFile = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
/** Number of lines of a text. */
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

// Weights of the hotspot criteria (they sum to 1): how widely the file is used matters most, then how much
// it changes lately, then its size.
const WEIGHTS = { uses: 0.5, heat: 0.3, lines: 0.2 };

/**
 * Usages of each Kotlin file: how many OTHER production files (app/src/main) mention its class name, i.e.
 * the file name without ".kt" as a whole word (Kotlin names a file after its main class and needs no import
 * within a package, so a name search is the reliable signal). Returns (file) => count.
 */
function usageCounter(allFiles) {
  const sources = allFiles.filter((f) => f.startsWith('app/src/main/') && f.endsWith('.kt')).map((f) => [f, readFile(f)]);
  return (file) => {
    const name = new RegExp(`\\b${path.basename(file, '.kt')}\\b`);
    return sources.filter(([f, text]) => f !== file && name.test(text)).length;
  };
}

/**
 * Percentile function over the values: (x) => 0–100, using mid-ranks so that ties share the same middle
 * position (otherwise, when most files have 0 usages, a single usage would already rank near the top).
 */
function percentile(values) {
  return (x) => {
    const below = values.filter((v) => v < x).length, equal = values.filter((v) => v === x).length;
    return (100 * (below + equal / 2)) / values.length;
  };
}

/**
 * Current Kotlin files of app/src ranked by a score out of 100: each criterion becomes a percentile
 * (robust to extreme values), then score = 50% usages + 30% recent activity (heat) + 20% lines.
 * Percentiles are measured among production files (app/src/main): test files are never used elsewhere and
 * would skew them; tests are still scored, against that same scale. Renamed files count only under their
 * current name.
 */
export function hotspots(allFiles, fileChanges) {
  const usesOf = usageCounter(allFiles);
  const files = allFiles
    .filter((f) => f.startsWith('app/src/') && f.endsWith('.kt') && fileChanges[f])
    .map((f) => ({ f, fc: fileChanges[f], lines: countLines(readFile(f)), uses: usesOf(f) }));
  const production = files.filter((x) => x.f.startsWith('app/src/main/'));
  const pct = {
    uses: percentile(production.map((x) => x.uses)),
    heat: percentile(production.map((x) => x.fc.heat)),
    lines: percentile(production.map((x) => x.lines)),
  };
  return files
    .map(({ f, fc, lines, uses }) => ({
      f, n: fc.n, heat: Math.round(fc.heat * 10) / 10, lines, uses, last: fc.last, authors: ranked(fc.authors),
      score: Math.round(WEIGHTS.uses * pct.uses(uses) + WEIGHTS.heat * pct.heat(fc.heat) + WEIGHTS.lines * pct.lines(lines)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, HOTSPOTS);
}

