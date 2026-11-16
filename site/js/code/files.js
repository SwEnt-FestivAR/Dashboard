// The Kotlin files of data.files as the Code tab draws them (pure logic, shared by the file graph and the file
// list): which files are shown, their folder tree, their "uses" links and the color of their area.

import { D } from '../core/store.js';

const COLORS = 10; // number of --cat-<n> tokens
const pathOf = (i) => D.files.p[i];

export const isTest = (f) => /\/(test|androidTest)\//.test(f);
/** Class name of a file: its name without ".kt". */
export const fileName = (i) => pathOf(i).split('/').pop().replace(/\.kt$/, '');
/** Sort comparator of file indexes by file name. */
export const byFileName = (a, b) => fileName(a).localeCompare(fileName(b));
/** Indexes in D.files.p of the files shown, tests included or not. */
export const shownFiles = (withTests) => D.files.p.map((_, i) => i).filter((i) => withTests || !isTest(pathOf(i)));

/** Area of a file: `ui/<feature>` under ui/, else its first folder under the app package, else "app". */
function areaOf(i) {
  const parts = pathOf(i).replace(/^app\/src\/\w+\/java\/(?:[a-z]+\/){3}/, '').split('/').slice(0, -1);
  if (!parts.length) return 'app';
  return parts[0] === 'ui' && parts[1] ? `ui/${parts[1]}` : parts[0];
}

/**
 * (i) => color token of the area of file i. Areas get the --cat-<n> colors by number of files, most first;
 * beyond the palette, they share the muted color.
 */
export function areaColor(indexes) {
  const counts = {};
  for (const i of indexes) counts[areaOf(i)] = (counts[areaOf(i)] || 0) + 1;
  const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const colors = Object.fromEntries(order.map((a, n) => [a, n < COLORS ? `var(--cat-${n + 1})` : 'var(--muted)']));
  return (i) => colors[areaOf(i)];
}

/**
 * Links of every file: { uses: [Set of indexes], usedBy: [Set of indexes] }, from the edges of data.files
 * ("file i mentions the class of file j"). Test files are dropped when `withTests` is false.
 */
export function fileLinks(withTests) {
  const keep = (i) => withTests || !isTest(pathOf(i));
  const uses = D.files.p.map(() => new Set()), usedBy = D.files.p.map(() => new Set());
  for (const [a, b] of D.files.e) {
    if (!keep(a) || !keep(b)) continue;
    uses[a].add(b);
    usedBy[b].add(a);
  }
  return { uses, usedBy };
}

/** Folder tree { name, dirs: Map, files: [index] } of app/src, where a chain of single folders becomes one "a/b/c". */
export function folderTree(indexes) {
  const root = { name: '', dirs: new Map(), files: [] };
  for (const i of indexes) {
    let node = root;
    for (const part of pathOf(i).replace(/^app\/src\//, '').split('/').slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(i);
  }
  const compact = (node) => {
    while (node.dirs.size === 1 && !node.files.length) {
      const [child] = node.dirs.values();
      Object.assign(node, { name: node.name ? `${node.name}/${child.name}` : child.name, dirs: child.dirs, files: child.files });
    }
    node.dirs.forEach(compact);
    return node;
  };
  return compact(root);
}

/** Sub-folders and files of a folder, each sorted by name: the order of both the graph and the list. */
export const children = (node) => ({
  dirs: [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name)),
  files: [...node.files].sort(byFileName),
});

/** Number of files under a folder. */
export const countFiles = (node) => node.files.length + [...node.dirs.values()].reduce((n, d) => n + countFiles(d), 0);
