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
    <p class="muted small">Score out of 100 = <b>50%</b> how widely the file is <b>used</b> (other files that mention its class)
      + <b>30%</b> its <b>recent activity</b> (each change halved every 14 days and weighted by its size)
      + <b>20%</b> its <b>size</b> (lines). Each criterion is a percentile among the production files.
      Files at the top are central, changing now and big: a bug there spreads, so they deserve the most care and review.</p>
    <div class="hotspots" id="hotspots"></div>
  </div>`;

function setup() {
  for (const sel of ['#hotspotTests', '#navAll']) $(sel).addEventListener('input', () => render());
}

function render() {
  renderNavGraph();
  const rows = D.hotspots.filter((h) => $('#hotspotTests').checked || !isTest(h.f));
  $('#hotspots').innerHTML = rows.map(hotspotRow).join('') || '<div class="empty">No hotspot</div>';
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

/** One hotspot. Its cells are placed with grid areas, so the same markup is a row on desktop and a card on phones. */
function hotspotRow(h, rank) {
  const total = sumBy(h.authors, (a) => a.n);
  const owner = h.authors[0];
  const share = owner.n / total;
  const dir = h.f.split('/').slice(-3, -1).join('/');
  return `<div class="hotspot">
    <span class="rank">${rank + 1}</span>
    <div class="hs-file">${extLink(repoUrl(`/blob/${D.branch}/${h.f}`), esc(h.f.split('/').pop()))}
      <span class="muted small">${esc(dir)}${isTest(h.f) ? ' · test' : ''}</span></div>
    <div class="hs-score" title="Score out of 100"><b>${h.score}</b><div class="hs-bar"><div style="width:${h.score}%"></div></div></div>
    <span class="hs-metrics muted small" title="${plural(h.n, 'commit')} in total">
      used by ${plural(h.uses, 'file')} · activity ${h.heat} · ${h.lines} lines<br>last change ${ago(h.last)}</span>
    <span class="hs-owner">${avatar(owner.login, 'sm', `${owner.n}/${total} commits · `)}${esc(P(owner.login).name)}
      <b>${Math.round(share * 100)}%</b></span>
    <span class="hs-pill">${share >= OWNER_WARNING
      ? '<span class="pill warn" title="One person made almost all the changes">bus factor 1</span>'
      : `<span class="pill">${plural(h.authors.length, 'author')}</span>`}</span>
  </div>`;
}

export default { id: 'code', label: 'Code', html, setup, render };
