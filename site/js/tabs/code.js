// Code tab: every Kotlin file as a graph and a list, with what each one uses and what uses it; the app's
// navigation graph; and hotspots, i.e. files with a lot of recent activity that are also complex (the best
// refactoring candidates; score computed in scripts/lib/repo.mjs), with their main owner and a warning when
// one person owns almost everything.

import { $, $$, esc, plural, sumBy } from '../core/utils.js';
import { D, P, ago, repoUrl } from '../core/store.js';
import { avatar, extLink } from '../core/ui.js';
import { fileLinks, isTest, shownFiles } from '../code/files.js';
import { fileGraphSvg } from '../code/file-radial.js';
import { filePanelHtml, fileTreeHtml } from '../code/file-tree.js';
import { navGraphSvg } from '../code/nav-graph.js';

const OWNER_WARNING = 0.8; // share of commits above which the file has a bus factor of 1

const state = {
  file: null, // index in D.files.p of the file selected in the graph or the list, or null
  links: null, // fileLinks() of the files shown (tests included or not)
};

const html = `
  <div class="card">
    <div class="card-head"><h3>Files</h3>
      <label class="check"><input type="checkbox" id="fileTests"> Include tests</label>
    </div>
    <p class="muted small">Every Kotlin file of <code>app/src</code> in its folders, colored by area: the root in the middle, folders
      on the inner rings, files around. A file <b>uses</b> another one when it mentions its class (curves inside the circle).
      Click a file in the graph or the list to see what it uses (<span class="ft-uses">blue</span>) and what uses it
      (<span class="ft-usedby">orange</span>); click it again to clear.</p>
    <div class="file-graph-box" id="fileGraph"></div>
    <div class="file-browser"><div id="fileTree"></div><div class="file-panel" id="filePanel"></div></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Navigation graph</h3>
      <label class="check"><input type="checkbox" id="navBar" checked> Show bottom bar links</label>
      <label class="check"><input type="checkbox" id="navAll"> Show back &amp; sign-out links</label>
    </div>
    <p class="muted small">Read from the NavGraph files and <code>*Navigator</code> classes of FestivAR. Border = screen status.
      A bar under a screen means it shows the bottom bar; its tabs open the screens tagged with a tab name (dotted links).
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
  for (const sel of ['#hotspotTests', '#navAll', '#navBar']) $(sel).addEventListener('input', () => render());
  $('#fileTests').addEventListener('input', renderFiles);
  renderFiles(); // not in render(): rebuilding it on every display would close the folders the user opened
}

function render() {
  renderNavGraph();
  const rows = D.hotspots.filter((h) => $('#hotspotTests').checked || !isTest(h.f));
  $('#hotspots').innerHTML = rows.map(hotspotRow).join('') || '<div class="empty">No hotspot</div>';
}

/** Rebuilds the file graph and list (tests included or not), then the selection. */
function renderFiles() {
  const withTests = $('#fileTests').checked;
  const indexes = shownFiles(withTests);
  state.links = fileLinks(withTests);
  if (state.file !== null && !withTests && isTest(D.files.p[state.file])) state.file = null;
  $('#fileGraph').innerHTML = fileGraphSvg(indexes, state.links);
  $('#fileTree').innerHTML = fileTreeHtml(indexes, state.links);
  for (const b of $$('.ft-file, .fr-leaf')) {
    b.addEventListener('click', () => selectFile(state.file === Number(b.dataset.i) ? null : Number(b.dataset.i)));
  }
  selectFile(state.file);
}

/**
 * Selects a file (or none): fills the panel, marks it and its links in the graph and the list, and opens the
 * folders of the selected file in the list.
 */
function selectFile(i) {
  state.file = i;
  $('#filePanel').innerHTML = filePanelHtml(i, state.links);
  for (const b of $$('.ft-link', $('#filePanel'))) b.addEventListener('click', () => selectFile(Number(b.dataset.i)));
  for (const b of $$('.ft-file, .fr-leaf')) {
    const j = Number(b.dataset.i);
    b.classList.toggle('on', j === i);
    b.classList.toggle('uses', i !== null && state.links.uses[i].has(j));
    b.classList.toggle('usedby', i !== null && state.links.usedBy[i].has(j));
  }
  $('#fileGraph svg').classList.toggle('focus', i !== null);
  for (const d of $$('.fr-dep')) {
    d.classList.toggle('uses', Number(d.dataset.a) === i);
    d.classList.toggle('usedby', Number(d.dataset.b) === i);
  }
  const selected = $('.ft-file.on', $('#fileTree'));
  for (let d = selected?.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
}

/** Draws the graph and highlights the links of the hovered screen (others fade out). */
function renderNavGraph() {
  const box = $('#navGraph');
  box.innerHTML = navGraphSvg($('#navAll').checked, $('#navBar').checked);
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
