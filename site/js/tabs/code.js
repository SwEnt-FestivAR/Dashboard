// Code tab: the app's navigation graph, and hotspots, i.e. the files changed most often that are also
// big (the best refactoring candidates), with their main owner and a warning when one person owns almost
// everything.

import { $, $$, esc, plural } from '../core/utils.js';
import { D, P, repoUrl } from '../core/store.js';
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
    <p class="muted small">Score = commits touching the file × its current size. Files at the top change often <em>and</em> are big:
      they are where bugs and merge conflicts concentrate, and the first candidates for splitting.</p>
    <div class="hotspots" id="hotspots"></div>
  </div>`;

function setup() {
  for (const sel of ['#hotspotTests', '#navAll']) $(sel).addEventListener('input', () => render());
}

function render() {
  renderNavGraph();
  const rows = D.hotspots.filter((h) => $('#hotspotTests').checked || !isTest(h.f));
  const maxScore = Math.max(1, ...rows.map((h) => h.n * h.lines));
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
  const total = h.authors.reduce((t, a) => t + a.n, 0);
  const owner = h.authors[0];
  const share = owner.n / total;
  const dir = h.f.split('/').slice(-3, -1).join('/');
  return `<div class="hotspot">
    <span class="rank">${rank + 1}</span>
    <div class="hs-file">${extLink(repoUrl(`/blob/${D.branch}/${h.f}`), esc(h.f.split('/').pop()))}
      <span class="muted small">${esc(dir)}${isTest(h.f) ? ' · test' : ''}</span></div>
    <div class="hs-score"><div style="width:${(100 * h.n * h.lines) / maxScore}%"></div></div>
    <span class="muted small">${plural(h.n, 'commit')} · ${h.lines} lines</span>
    <span class="hs-owner">${avatar(owner.login, 'sm', `${owner.n}/${total} commits · `)}${esc(P(owner.login).name)} <b>${Math.round(share * 100)}%</b></span>
    ${share >= OWNER_WARNING ? '<span class="pill warn" title="One person made almost all the changes">bus factor 1</span>' : `<span class="pill">${plural(h.authors.length, 'author')}</span>`}
  </div>`;
}

export default { id: 'code', label: 'Code', html, setup, render };
