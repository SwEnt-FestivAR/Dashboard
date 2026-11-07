// HTML of one screen card: header (name + status badge), Screen and ViewModel blocks, footer (issues,
// tests, PRs, note) and the expandable list of open issues.

import { esc, fmtDate, plural, ts, uniq } from '../core/utils.js';
import { D, P, ago, nameOf, repoUrl } from '../core/store.js';
import { avatar, avatars, extLink, issueRow } from '../core/ui.js';
import { statusInfo, unitId, unitIssues, unitStatus } from './units.js';

/** `expanded` = the open-issues list is shown. Buttons carry data-id for the click handlers of the tab. */
export function screenCard(u, expanded) {
  const st = unitStatus(u);
  const info = statusInfo(st.status);
  const issues = unitIssues(u);
  const blocks = u.planned
    ? plannedBlock(u, 'screen', 'Screen') + plannedBlock(u, 'viewModel', 'ViewModel')
    : fileBlock(u.screen, 'Screen') + fileBlock(u.viewModel, 'ViewModel');
  return `<div class="unit" style="--sc:var(${info.css})">
    <div class="unit-head"><h4>${esc(u.key)}</h4>
      ${st.frozenBroken ? '<span class="pill bad" title="Frozen but modified after the freeze date or touched by an open PR">⚠ touched while frozen</span>' : ''}
      <button class="status-btn" data-id="${esc(unitId(u))}" title="${esc(info.desc)} — click to change">${info.label} <small>· ${st.manual ? 'manual' : 'auto'}</small></button>
    </div>
    <div class="blocks">${blocks}</div>
    <div class="unit-foot">
      ${issuesButton(u, issues, expanded)}${u.planned ? '' : testPills(u)}${prPills(u)}${branchPills(u)}
      ${st.note ? `<div class="note">📝 ${esc(st.note)}</div>` : ''}
    </div>
    ${expanded && issues.length ? `<ul class="issue-list unit-issues">${issues.map(issueRow).join('')}</ul>` : ''}
  </div>`;
}

function issuesButton(u, issues, expanded) {
  if (!issues.length) return '<span class="pill">no open issue</span>';
  const assignees = uniq(issues.flatMap((i) => i.as));
  return `<button class="issues-btn ${expanded ? 'on' : ''}" data-id="${esc(unitId(u))}" title="Show the open issues about this screen">
    ${expanded ? '▾' : '▸'} ${plural(issues.length, 'open issue')}
    ${assignees.length ? avatars(assignees) : '<span class="minus small">unassigned</span>'}</button>`;
}

function testPills(u) {
  const pill = (names, kind) => (names.length
    ? `<span class="pill ok" title="${esc(names.join(', '))}">✓ ${plural(names.length, `${kind} test file`)}</span>`
    : `<span class="pill bad">✗ no ${kind} test</span>`);
  return pill(u.tests.ui, 'UI') + pill(u.tests.unit, 'unit');
}

function prPills(u) {
  return u.openPRs.map((n) => {
    const pr = D.openPRs.find((p) => p.n === n);
    return `<a class="pill info" href="${repoUrl(`/pull/${n}`)}" target="_blank" rel="noopener" title="${esc(pr?.title)} — ${nameOf(pr?.a)}">PR #${n}</a>`;
  }).join('');
}

/** Branches with work on this screen, except the ones of open PRs (already shown as PR pills). */
function branchPills(u) {
  const prBranches = new Set(D.openPRs.map((p) => p.branch));
  return (u.branches || []).filter((b) => !prBranches.has(b))
    .map((b) => extLink(repoUrl(`/tree/${b}`), `⎇ ${esc(b)}`, 'pill branch')).join('');
}

/** Where a file lives when it is not on main yet: [link, pill label], or null for files on main. */
function notOnMain(f) {
  if (f.inPR) return [repoUrl(`/pull/${f.inPR}/files`), `only in PR #${f.inPR}`];
  if (f.inBranch) return [repoUrl(`/blob/${f.inBranch}/${f.path}`), `only in ⎇ ${esc(f.inBranch)}`];
  return null;
}

/** Half of a card for a file. `f` is a FileInfo (see the schema in fetch-data.mjs) or null. */
function fileBlock(f, kind) {
  if (!f) return `<div class="block missing">No ${kind}</div>`;
  const elsewhere = notOnMain(f);
  const href = elsewhere ? elsewhere[0] : repoUrl(`/blob/${D.branch}/${f.path}`);
  const others = (f.contributors || []).filter((c) => c.login !== f.author);
  const history = elsewhere
    ? `~${f.lines} lines`
    : `${f.lines} lines · ${plural(f.commits, 'commit')}${f.todos ? ` · <span class="minus">${f.todos} TODO</span>` : ''}<br>
       Last change ${ago(f.lastModified)} by ${nameOf(f.lastAuthor)}`;
  return `<div class="block">
    <div class="kind"><span>${kind}</span>${elsewhere ? `<span class="pill warn">${elsewhere[1]}</span>` : ''}</div>
    <div class="fname">${extLink(href, esc(f.path.split('/').pop()))}</div>
    <div class="author">${avatar(f.author)}<div><span class="muted small">Initial author</span><b>${nameOf(f.author)}</b></div></div>
    <div class="meta">Created ${fmtDate(f.created)}<br>${history}
      ${others.length ? `<div class="also">Also: <span class="avatars">${others.map((c) => avatar(c.login, 'xs', `${plural(c.n, 'commit')} · `)).join('')}</span></div>` : ''}
    </div></div>`;
}

/** Half of a planned card: the issue(s) asking for this file and their assignees. */
function plannedBlock(u, slot, kind) {
  const issues = u.plannedIssues[slot].map((n) => D.issues.find((i) => i.n === n));
  if (!issues.length) return `<div class="block missing">No issue for the ${kind} yet</div>`;
  const assignees = uniq(issues.flatMap((i) => i.as));
  const who = assignees.length
    ? `${avatars(assignees, '')}<div><span class="muted small">Planned by</span><b>${assignees.map((a) => esc(P(a).name)).join(', ')}</b></div>`
    : '<span class="minus small">Nobody assigned yet</span>';
  return `<div class="block">
    <div class="kind"><span>${kind}</span><span class="pill">not in code yet</span></div>
    <div class="fname">${issues.map((i) => extLink(repoUrl(`/issues/${i.n}`), `#${i.n}`)).join(', ')}</div>
    <div class="author">${who}</div>
    <div class="meta">Issue opened ${fmtDate(Math.min(...issues.map((i) => ts(i.c))))}</div></div>`;
}
