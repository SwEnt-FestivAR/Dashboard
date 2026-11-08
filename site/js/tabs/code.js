// Code tab: the app's navigation graph, and hotspots, i.e. files with a lot of recent activity that are
// also complex (the best refactoring candidates; score computed in scripts/lib/repo.mjs), with their main
// owner and a warning when one person owns almost everything.

import { $, $$, esc, plural, sumBy } from '../core/utils.js';
import { D, P, ago, repoUrl } from '../core/store.js';
import { avatar, extLink } from '../core/ui.js';
import { navGraphSvg } from '../code/nav-graph.js';

const OWNER_WARNING = 0.8; // share of commits above which the file has a bus factor of 1
const isTest = (f) => /\/(test|androidTest)\//.test(f);

const html = `
  <div class="card">
    <div class="card-head"><h3>Navigation graph</h3>
      <label class="check"><input type="checkbox" id="navAll"> Show back &amp; sign-out links</label>
    </div>
    <p class="muted small">Read from the <code>*Navigator</code> classes of FestivAR. Border = screen status.
      Hover a screen to highlight its links, click it to open its card.</p>
    <div class="nav-graph-box" id="navGraph"></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Hotspots</h3>
      <label class="check"><input type="checkbox" id="hotspotTests"> Include tests</label>
    </div>
    <p class="muted small">Score = <b>recent activity</b> × log<sub>2</sub>(1 + <b>complexity</b>).
      Recent activity sums the changes to the file, each one halved every 14 days (two sprints) and weighted by its size (log of lines changed).
      Complexity is the sum of indentation levels of the code, so nested logic weighs more than long flat code.
      Files at the top change a lot <em>now</em> and are hard to read: that is where bugs and merge conflicts concentrate.</p>
    <div class="hotspots" id="hotspots"></div>
  </div>`;

function setup() {
  for (const sel of ['#hotspotTests', '#navAll']) $(sel).addEventListener('input', () => render());
}

function render() {
  renderNavGraph();
  const rows = D.hotspots.filter((h) => $('#hotspotTests').checked || !isTest(h.f));
  const maxScore = Math.max(1, ...rows.map((h) => h.score));
  $('#hotspots').innerHTML = rows.map((h, i) => hotspotRow(h, i, maxScore)).join('') || '<div class="empty">No hotspot</div>';
}

/** Draws the graph and highlights the links of the hovered screen (others fade out). */
function renderNavGraph() {
  const box = $('#navGraph');
  box.innerHTML = navGraphSvg($('#navAll').checked);
  const svg = $('svg', box);
  for (const node of $$('.ng-node', box)) {
    const s = node.dataset.screen;
    node.addEventListener('mouseenter', () => {
      svg.classList.add('focus');
      for (const e of $$('.ng-edge', box)) e.classList.toggle('on', e.dataset.from === s || e.dataset.to === s);
    });
    node.addEventListener('mouseleave', () => svg.classList.remove('focus'));
  }
}

function hotspotRow(h, rank, maxScore) {
  const total = sumBy(h.authors, (a) => a.n);
  const owner = h.authors[0];
  const share = owner.n / total;
  const dir = h.f.split('/').slice(-3, -1).join('/');
  return `<div class="hotspot">
    <span class="rank">${rank + 1}</span>
    <div class="hs-file">${extLink(repoUrl(`/blob/${D.branch}/${h.f}`), esc(h.f.split('/').pop()))}
      <span class="muted small">${esc(dir)}${isTest(h.f) ? ' · test' : ''}</span></div>
    <div class="hs-score" title="Score ${h.score} = activity ${h.heat} × log2(1 + complexity ${h.complexity})"><div style="width:${(100 * h.score) / maxScore}%"></div></div>
    <span class="muted small" title="${plural(h.n, 'commit')} in total, ${h.lines} lines">activity ${h.heat} · complexity ${h.complexity}<br>last change ${ago(h.last)}</span>
    <span class="hs-owner">${avatar(owner.login, 'sm', `${owner.n}/${total} commits · `)}${esc(P(owner.login).name)} <b>${Math.round(share * 100)}%</b></span>
    ${share >= OWNER_WARNING ? '<span class="pill warn" title="One person made almost all the changes">bus factor 1</span>' : `<span class="pill">${plural(h.authors.length, 'author')}</span>`}
  </div>`;
}

export default { id: 'code', label: 'Code', html, setup, render };
