// Screens tab: status summary, filters, and screen cards grouped by feature.

import { $, $$, esc, plural, seg, toggle, uniq } from '../core/utils.js';
import { D, statusFileUrl } from '../core/store.js';
import { avatar, fillPeopleSelect } from '../core/ui.js';
import { STATUSES, plannedUnits, statusBar, unitAssignees, unitId, unitIssues, unitStatus } from '../screens/units.js';
import { screenCard } from '../screens/card.js';
import { initStatusDialog, openStatusDialog } from '../screens/status-dialog.js';

const state = {
  route: '',           // last route argument applied ("#screens/<query>"), so a re-render does not reapply it
  feature: 'all',
  expanded: new Set(), // ids of the cards whose issue list is open
};

const html = `
  <div class="card status-summary" id="statusSummary"></div>
  <div class="toolbar">
    <input id="screenSearch" type="search" placeholder="Search a screen…">
    <select id="screenAuthor"><option value="">All authors</option></select>
    <select id="screenStatus"><option value="">All statuses</option></select>
    <label class="check"><input type="checkbox" id="withIssues"> With open issues</label>
    <div class="seg small" id="featureFilter"></div>
  </div>
  <div id="features"></div>`;

function setup() {
  // Planned screens are derived from issues here, once, and start with their issues shown.
  const planned = plannedUnits(D.units, D.issues);
  D.units.push(...planned);
  for (const u of planned) state.expanded.add(unitId(u));

  initStatusDialog();
  $('#screenStatus').insertAdjacentHTML('beforeend', STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join(''));
  fillPeopleSelect('#screenAuthor', uniq(D.units.flatMap((u) => [u.screen?.author, u.viewModel?.author, ...unitAssignees(u)]).filter(Boolean)).sort());
  const features = uniq(D.units.map((u) => u.feature));
  $('#featureFilter').innerHTML = ['all', ...features]
    .map((f) => `<button data-f="${esc(f)}" class="${f === 'all' ? 'on' : ''}">${f === 'all' ? 'All features' : esc(f)}</button>`).join('');
  seg('#featureFilter', 'f', (f) => { state.feature = f; render(); });
  for (const sel of ['#screenSearch', '#screenAuthor', '#screenStatus', '#withIssues']) $(sel).addEventListener('input', () => render());
}

/** Units matching the toolbar filters. An author matches as initial author, or as assignee of a planned screen. */
function filteredUnits() {
  const query = $('#screenSearch').value.toLowerCase();
  const author = $('#screenAuthor').value;
  const status = $('#screenStatus').value;
  const withIssues = $('#withIssues').checked;
  return D.units.filter((u) =>
    (state.feature === 'all' || u.feature === state.feature)
    && (!query || [u.key, u.feature, u.screen?.path, u.viewModel?.path].join(' ').toLowerCase().includes(query))
    && (!author || u.screen?.author === author || u.viewModel?.author === author || (u.planned && unitAssignees(u).includes(author)))
    && (!status || unitStatus(u).status === status)
    && (!withIssues || unitIssues(u).length > 0));
}

/** `query` comes from the route "#screens/<query>" (used by the search palette) and fills the search box. */
function render(query = '') {
  if (query && query !== state.route) $('#screenSearch').value = query;
  state.route = query;
  renderSummary();
  const units = filteredUnits();
  $('#features').innerHTML = uniq(units.map((u) => u.feature))
    .map((f) => featureSection(f, units.filter((u) => u.feature === f))).join('')
    || '<div class="empty">No screen matches these filters</div>';
  for (const b of $$('.status-btn')) b.addEventListener('click', () => openStatusDialog(b.dataset.id));
  for (const b of $$('.issues-btn')) b.addEventListener('click', () => { toggle(state.expanded, b.dataset.id); render(); });
}

function renderSummary() {
  const all = D.units;
  const count = (id) => all.filter((u) => unitStatus(u).status === id).length;
  const done = count('finalized') + count('frozen');
  $('#statusSummary').innerHTML = `
    <div class="card-head flush"><h3>${plural(all.length, 'screen')} · ${Math.round((100 * done) / all.length)}% finalized</h3>
      <span class="muted small">Auto status from code, PRs &amp; issues, overridden by
        <a href="${esc(statusFileUrl())}" target="_blank" rel="noopener">status.json</a>. Click a badge to change it.</span></div>
    <div class="bar">${statusBar(all)}</div>
    <div class="legend">${STATUSES.map((s) => `<span title="${esc(s.desc)}"><i class="dot" style="background:var(${s.css})"></i>${s.label} <b>${count(s.id)}</b></span>`).join('')}</div>`;
}

/** A feature heading (progress, contributors, bus factor) followed by the cards of `units`. */
function featureSection(feature, units) {
  const featureUnits = D.units.filter((u) => u.feature === feature);
  const commits = {};
  for (const u of featureUnits) {
    for (const c of [u.screen, u.viewModel].flatMap((f) => f?.contributors || [])) commits[c.login] = (commits[c.login] || 0) + c.n;
  }
  const people = Object.entries(commits).sort((a, b) => b[1] - a[1]);
  return `<div class="feature">
    <div class="feature-head"><h2>${esc(feature)}</h2><span class="pill">${plural(featureUnits.length, 'screen')}</span>
      <div class="mini">${statusBar(featureUnits)}</div>
      <span class="muted small">Contributors</span><span class="avatars">${people.map(([l, n]) => avatar(l, 'sm', `${plural(n, 'commit')} · `)).join('')}</span>
      ${people.length === 1 ? '<span class="pill warn" title="Only one person ever touched this feature">bus factor 1</span>' : ''}
    </div>
    <div class="units">${units.map((u) => screenCard(u, state.expanded.has(unitId(u)))).join('')}</div>
  </div>`;
}

export default { id: 'screens', label: 'Screens', html, setup, render };
