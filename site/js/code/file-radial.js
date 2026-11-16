// File graph of the Code tab: a radial tree of app/src. The root is at the center, folders on inner rings,
// every file on the outer circle with its name, and curves inside the circle from a file to the files it uses.

import { esc } from '../core/utils.js';
import { D } from '../core/store.js';
import { areaColor, children, fileName, folderTree, isTest } from './files.js';

const STEP = 14; // px of circumference per file, so that names never overlap
const MIN_RADIUS = 240;
const LABEL = 200; // room for the names outside the circle
const n1 = (v) => v.toFixed(1);

/**
 * Folders and files of the tree in tree order (so a folder's files are side by side), with their angle `a`:
 * files evenly spread on the circle, each folder at the middle angle of its files.
 * Returns { folders: [{ name, depth, a, kids }], leaves: [{ i, a }] }.
 */
function angles(root) {
  const folders = [], leaves = [];
  const walk = (node, depth) => {
    const folder = { name: node.name, depth, kids: [] };
    folders.push(folder);
    const { dirs, files } = children(node);
    for (const d of dirs) folder.kids.push(walk(d, depth + 1));
    for (const i of files) {
      const leaf = { i };
      leaves.push(leaf);
      folder.kids.push(leaf);
    }
    return folder;
  };
  walk(root, 0);
  leaves.forEach((l, k) => { l.a = (2 * Math.PI * k) / leaves.length - Math.PI / 2; });
  const angle = (n) => {
    if (!n.kids) return n.a;
    const as = n.kids.map(angle);
    n.a = (Math.min(...as) + Math.max(...as)) / 2;
    return n.a;
  };
  angle(folders[0]);
  return { folders, leaves };
}

/**
 * Sets x, y on every node: files on the circle of radius R, folders on rings between 40% and 85% of R by depth
 * (the deep folders, the most numerous, get the most room), the root at the center C.
 */
function placeNodes({ folders, leaves }, R, C) {
  const depthMax = Math.max(...folders.map((f) => f.depth));
  const ring = (depth) => (depth ? R * (0.4 + (0.45 * (depth - 1)) / Math.max(depthMax - 1, 1)) : 0);
  for (const n of [...folders, ...leaves]) {
    const r = n.kids ? ring(n.depth) : R;
    Object.assign(n, { x: C + r * Math.cos(n.a), y: C + r * Math.sin(n.a) });
  }
}

/** One file: a dot on the circle and its name, rotated along the radius (flipped on the left half to stay upright). */
function leafSvg({ i, a, x, y }, color) {
  const left = Math.cos(a) < 0, deg = (a * 180) / Math.PI + (left ? 180 : 0);
  const tx = x + 7 * Math.cos(a), ty = y + 7 * Math.sin(a);
  return `<g class="fr-leaf${isTest(D.files.p[i]) ? ' test' : ''}" data-i="${i}" style="--c:${color}">
    <title>${esc(D.files.p[i])} · ${D.files.l[i]} lines</title><circle cx="${n1(x)}" cy="${n1(y)}" r="3.5"/>
    <text x="${n1(tx)}" y="${n1(ty)}" dy="4" text-anchor="${left ? 'end' : 'start'}"
      transform="rotate(${n1(deg)} ${n1(tx)} ${n1(ty)})">${esc(fileName(i))}</text></g>`;
}

/**
 * The SVG of the given files. Each file is a `.fr-leaf` with its index (clicking it selects the file), each
 * "uses" curve a `.fr-dep` from file a to file b, colored like the file that uses and bent toward the center.
 */
export function fileGraphSvg(indexes, links) {
  const nodes = angles(folderTree(indexes));
  const R = Math.max(MIN_RADIUS, (nodes.leaves.length * STEP) / (2 * Math.PI)), C = R + LABEL;
  placeNodes(nodes, R, C);
  const colorOf = areaColor(indexes);
  const leafOf = new Map(nodes.leaves.map((l) => [l.i, l]));
  const tree = nodes.folders.flatMap((f) => f.kids.map((k) => `<path class="fr-tree" d="M${n1(f.x)},${n1(f.y)} L${n1(k.x)},${n1(k.y)}"/>`));
  const deps = nodes.leaves.flatMap(({ i, x, y }) => [...links.uses[i]].filter((j) => leafOf.has(j)).map((j) => {
    const b = leafOf.get(j), cx = C + ((x + b.x) / 2 - C) / 4, cy = C + ((y + b.y) / 2 - C) / 4;
    return `<path class="fr-dep" data-a="${i}" data-b="${j}" style="--c:${colorOf(i)}"
      d="M${n1(x)},${n1(y)} Q${n1(cx)},${n1(cy)} ${n1(b.x)},${n1(b.y)}"/>`;
  }));
  const folderLabels = nodes.folders.filter((f) => f.name)
    .map((f) => `<text class="fr-folder" x="${n1(f.x)}" y="${n1(f.y - 6)}">${esc(f.name.split('/').pop())}</text>`);
  const files = nodes.leaves.map((l) => leafSvg(l, colorOf(l.i)));
  return `<svg class="file-graph" viewBox="0 0 ${n1(2 * C)} ${n1(2 * C)}" style="max-width:${Math.ceil(2 * C)}px"
    role="img" aria-label="File graph">${tree.join('')}${deps.join('')}${folderLabels.join('')}${files.join('')}</svg>`;
}
