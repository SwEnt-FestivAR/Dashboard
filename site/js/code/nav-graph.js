// SVG of the app's navigation graph (data.navigation): screens in columns by feature, arrows for
// navigation links, border color = screen status. Hand-made layout, no library.

import { esc } from '../core/utils.js';
import { D } from '../core/store.js';
import { statusInfo, unitStatus } from '../screens/units.js';

const NODE_W = 150, NODE_H = 38, COL_GAP = 90, ROW_GAP = 26, PAD = 30, HEAD = 34;

/** Number of "go" links from the start screen (the first route) to each screen; unreachable = Infinity. */
function depths(screens, edges) {
  const depth = Object.fromEntries(screens.map((s) => [s, Infinity]));
  const queue = [screens[0]];
  depth[screens[0]] = 0;
  while (queue.length) {
    const s = queue.shift();
    for (const e of edges) {
      if (e.kind === 'go' && e.from === s && depth[e.to] === Infinity) {
        depth[e.to] = depth[s] + 1;
        queue.push(e.to);
      }
    }
  }
  return depth;
}

/**
 * Screens grouped by feature. Features and the screens inside them are ordered by their distance from the
 * start screen, so the graph reads left to right in the order a user goes through the app.
 */
function columns(screens, edges) {
  const depth = depths(screens, edges);
  const featureOf = (s) => D.units.find((u) => u.key === s)?.feature || 'other';
  const cols = new Map();
  for (const s of [...screens].sort((a, b) => depth[a] - depth[b])) {
    const f = featureOf(s);
    if (!cols.has(f)) cols.set(f, []);
    cols.get(f).push(s);
  }
  return [...cols];
}

/** Cubic curve between two nodes: right side → left side, or a loop on the right inside a column. */
function edgePath(a, b) {
  if (a.x === b.x) {
    const x = a.x + NODE_W, bulge = x + 32;
    return `M${x},${a.y + NODE_H / 2} C${bulge},${a.y + NODE_H / 2} ${bulge},${b.y + NODE_H / 2} ${x},${b.y + NODE_H / 2}`;
  }
  const forward = b.x > a.x;
  const x1 = forward ? a.x + NODE_W : a.x, x2 = forward ? b.x : b.x + NODE_W;
  const dx = (x2 - x1) / 2;
  return `M${x1},${a.y + NODE_H / 2} C${x1 + dx},${a.y + NODE_H / 2} ${x2 - dx},${b.y + NODE_H / 2} ${x2},${b.y + NODE_H / 2}`;
}

/**
 * Returns the SVG. With `showAll` false, "back" links and links to the start screen (the first route,
 * i.e. sign-out and auth redirects) are hidden because they connect almost everything to it.
 */
export function navGraphSvg(showAll) {
  const { screens, edges } = D.navigation;
  const cols = columns(screens, edges);
  const pos = {};
  cols.forEach(([, list], c) => list.forEach((s, r) => {
    pos[s] = { x: PAD + c * (NODE_W + COL_GAP), y: PAD + HEAD + r * (NODE_H + ROW_GAP) };
  }));
  const width = PAD * 2 + cols.length * NODE_W + (cols.length - 1) * COL_GAP;
  const height = PAD * 2 + HEAD + Math.max(...cols.map(([, l]) => l.length)) * (NODE_H + ROW_GAP);
  const shown = edges.filter((e) => pos[e.from] && pos[e.to] && (showAll || (e.kind === 'go' && e.to !== screens[0])));

  const heads = cols.map(([f], c) => `<text class="ng-head" x="${PAD + c * (NODE_W + COL_GAP) + NODE_W / 2}" y="${PAD}">${esc(f)}</text>`);
  const lines = shown.map((e) => `<path class="ng-edge ${e.kind}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"
    d="${edgePath(pos[e.from], pos[e.to])}" marker-end="url(#ng-arrow)"/>`);
  const nodes = Object.entries(pos).map(([s, p]) => {
    const unit = D.units.find((u) => u.key === s);
    const color = unit ? `var(${statusInfo(unitStatus(unit).status).css})` : 'var(--border)';
    return `<a href="#screens/${encodeURIComponent(s)}" class="ng-node" data-screen="${esc(s)}">
      <title>${esc(s)}${unit ? ` · ${statusInfo(unitStatus(unit).status).label}` : ' · no Screen file'}</title>
      <rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="10" style="stroke:${color}"/>
      <text x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2 + 4}">${esc(s)}</text></a>`;
  });
  return `<svg class="nav-graph" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Navigation graph">
    <defs><marker id="ng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z"/></marker></defs>
    ${heads.join('')}${lines.join('')}${nodes.join('')}</svg>`;
}
