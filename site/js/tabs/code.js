// Code tab: hotspots, i.e. the files changed most often that are also big. They are the best
// refactoring candidates. Each row shows the main owner and warns when one person owns almost everything.

import { $, esc, plural } from '../core/utils.js';
import { D, P, repoUrl } from '../core/store.js';
import { avatar, extLink } from '../core/ui.js';

const OWNER_WARNING = 0.8; // share of commits above which the file has a bus factor of 1
const isTest = (f) => /\/(test|androidTest)\//.test(f);

const html = `
  <div class="card">
    <div class="card-head"><h3>Hotspots</h3>
      <label class="check"><input type="checkbox" id="hotspotTests"> Include tests</label>
    </div>
    <p class="muted small">Score = commits touching the file × its current size. Files at the top change often <em>and</em> are big:
      they are where bugs and merge conflicts concentrate, and the first candidates for splitting.</p>
    <div class="hotspots" id="hotspots"></div>
  </div>`;

function setup() {
  $('#hotspotTests').addEventListener('input', () => render());
}

function render() {
  const rows = D.hotspots.filter((h) => $('#hotspotTests').checked || !isTest(h.f));
  const maxScore = Math.max(1, ...rows.map((h) => h.n * h.lines));
  $('#hotspots').innerHTML = rows.map((h, i) => hotspotRow(h, i, maxScore)).join('') || '<div class="empty">No hotspot</div>';
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
