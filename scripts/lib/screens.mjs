// Screen units (Screen + ViewModel pairs, see the schema in scripts/fetch-data.mjs), from main, open PRs and
// every other branch of the clone, with their tests.

import path from 'node:path';
import { git } from './env.mjs';
import { resolve } from './people.mjs';
import { countLines, ranked, readFile } from './repo.mjs';

// Captures: [1] feature folder, [2] screen key, [3] "Screen" | "ViewModel"
const UI_RE = /^app\/src\/main\/java\/.*\/ui\/([^/]+)\/(?:.*\/)?([A-Za-z0-9]+?)(Screen|ViewModel)\.kt$/;
// ui/ subfolders that hold shared code, not screens
const SKIP_FEATURES = new Set(['components', 'theme']);

/** { feature, key, slot: "screen"|"viewModel" } for a screen file path, or null. */
function parse(file) {
  const m = UI_RE.exec(file);
  if (!m || SKIP_FEATURES.has(m[1])) return null;
  return { feature: m[1], key: m[2], slot: m[3] === 'Screen' ? 'screen' : 'viewModel' };
}

/** History of a file on the default branch (--follow tracks renames). The oldest commit gives the initial author. */
function fileInfo(branch, file) {
  const history = git('log', branch, '--follow', '--format=%H%x1f%an%x1f%ae%x1f%at', '--', file).trim().split('\n').filter(Boolean)
    .map((line) => {
      const [sha, name, email, at] = line.split('\x1f');
      return { login: resolve(name, email, sha), at: Number(at) };
    });
  const counts = {};
  for (const c of history) counts[c.login] = (counts[c.login] || 0) + 1;
  const text = readFile(file);
  return {
    path: file, lines: countLines(text), todos: (text.match(/\bTODO\b/g) || []).length,
    author: history.at(-1)?.login, created: history.at(-1)?.at, lastModified: history[0]?.at, lastAuthor: history[0]?.login,
    commits: history.length, contributors: ranked(counts),
  };
}

/**
 * Files added or modified in each remote branch compared to the default branch (since their merge base),
 * read from the clone, so no API call. Deleted files are ignored; renamed files count under their new name.
 */
function branchChanges(branch) {
  const refs = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin').split('\n')
    .filter((r) => r.startsWith('origin/') && r !== 'origin/HEAD' && r !== `origin/${branch}`);
  return refs.flatMap((ref) => git('diff', '--name-status', `origin/${branch}...${ref}`)
    .split('\n').filter(Boolean).map((line) => line.split('\t'))
    .filter(([status]) => status[0] !== 'D')
    .map(([, file, renamedTo]) => ({ branch: ref.slice('origin/'.length), file: renamedTo || file })));
}

/** FileInfo of a file that only exists in a branch: author and date of the commit that added it there. */
function branchFileInfo(branch, file) {
  const [sha, name, email, at] = git('log', '-1', '--diff-filter=A', '--format=%H%x1f%an%x1f%ae%x1f%at', `origin/${branch}`, '--', file).trim().split('\x1f');
  const author = resolve(name, email, sha);
  const lines = countLines(git('show', `origin/${branch}:${file}`));
  return { path: file, inBranch: branch, author, created: Number(at), lines, contributors: [{ login: author, n: 1 }] };
}

/**
 * All units, sorted by feature then key. Files on main win over PR files, which win over branch files.
 * Also fills `screens` (["feature/Key"]) on each open PR.
 */
export function buildUnits(allFiles, openPRs, branch) {
  const units = {};
  const unitFor = ({ feature, key }) => (units[`${feature}/${key}`] ||= { feature, key, screen: null, viewModel: null, openPRs: [], branches: [] });

  for (const f of allFiles) {
    const p = parse(f);
    if (p) unitFor(p)[p.slot] = fileInfo(branch, f);
  }
  for (const pr of openPRs) {
    pr.screens = [];
    for (const file of pr.files) {
      const p = parse(file.f);
      if (!p) continue;
      const u = unitFor(p);
      if (!u[p.slot] && file.s !== 'removed') {
        u[p.slot] = { path: file.f, inPR: pr.n, author: pr.a, created: Date.parse(pr.c) / 1000, lines: file.add, contributors: [{ login: pr.a, n: 1 }] };
      }
      if (!u.openPRs.includes(pr.n)) u.openPRs.push(pr.n);
      if (!pr.screens.includes(`${p.feature}/${p.key}`)) pr.screens.push(`${p.feature}/${p.key}`);
    }
  }
  for (const { branch: b, file } of branchChanges(branch)) {
    const p = parse(file);
    if (!p) continue;
    const u = unitFor(p);
    u[p.slot] ||= branchFileInfo(b, file);
    if (!u.branches.includes(b)) u.branches.push(b);
  }

  // Tests are matched by file name prefix (CreateTaskScreenTest, CreateTaskViewModelTest… belong to "CreateTask").
  // androidTest/ = UI tests, test/ = unit tests.
  const testFiles = allFiles.filter((f) => /\/(test|androidTest)\/.*\/ui\/.*Test\.kt$/.test(f));
  for (const u of Object.values(units)) {
    const matching = testFiles.filter((t) => path.basename(t).startsWith(u.key));
    u.tests = {
      ui: matching.filter((t) => t.includes('/androidTest/')).map((t) => path.basename(t, '.kt')),
      unit: matching.filter((t) => t.includes('/test/')).map((t) => path.basename(t, '.kt')),
    };
  }
  return Object.values(units).sort((a, b) => a.feature.localeCompare(b.feature) || a.key.localeCompare(b.key));
}
