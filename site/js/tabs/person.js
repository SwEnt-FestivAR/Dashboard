// Profile page of one person, reached by the route "#person/<login>" (hidden from the nav):
// totals, a GitHub-style activity calendar, and their PRs, issues and screens.

import { $, DAY, addWeeks, countBy, esc, fmtDate, fmtNum, plural, sumBy, ts, weekStart } from '../core/utils.js';
import { D, NOW, isCompleted } from '../core/store.js';
import { avatar, extLink, issueRow, kpis, linesHtml, listItems, prRow } from '../core/ui.js';
import { unitAssignees } from '../screens/units.js';

const CALENDAR_WEEKS = 20;

const html = `
  <div class="card profile-head" id="profileHead"></div>
  <div class="kpis" id="profileKpis"></div>
  <div class="card">
    <div class="card-head"><h3>Activity</h3><span class="muted small">commits per day, last ${CALENDAR_WEEKS} weeks</span></div>
    <div class="calendar" id="profileCalendar"></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Open PRs</h3></div><ul class="issue-list" id="profilePRs"></ul></div>
    <div class="card"><div class="card-head"><h3>Assigned open issues</h3></div><ul class="issue-list" id="profileIssues"></ul></div>
    <div class="card"><div class="card-head"><h3>Screens</h3><span class="muted small">initial author or planned by</span></div><ul class="issue-list" id="profileScreens"></ul></div>
    <div class="card"><div class="card-head"><h3>Recently merged PRs</h3></div><ul class="issue-list" id="profileMerged"></ul></div>
  </div>`;

/** "merged 7 Nov 2026", "draft" or "ready for review". */
function prState(p) {
  if (p.m) return `merged ${fmtDate(ts(p.m))}`;
  return p.d ? 'draft' : 'ready for review';
}
const prWithState = (p) => prRow(p, `<span class="muted small">${prState(p)}</span>`);

/** Role of a person on a screen, or null: "Screen author", "ViewModel author" or "Planned". */
function screenRole(u, login) {
  if (u.planned) return unitAssignees(u).includes(login) ? 'Planned' : null;
  const roles = [u.screen?.author === login && 'Screen', u.viewModel?.author === login && 'ViewModel'].filter(Boolean);
  return roles.length ? `${roles.join(' + ')} author` : null;
}

/** Weeks × 7 days grid of commit counts; darker = more commits (4 levels relative to the busiest day). */
function calendar(login) {
  const perDay = countBy(D.commits.filter((c) => c.a === login).map((c) => Math.floor(c.t / DAY)));
  const max = Math.max(1, ...Object.values(perDay));
  const first = addWeeks(weekStart(NOW), 1 - CALENDAR_WEEKS); // columns are weeks, Friday to Thursday
  const weeks = [];
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const t = first + (w * 7 + d) * DAY;
      const n = perDay[Math.floor(t / DAY)] || 0;
      const intensity = n ? Math.ceil((4 * n) / max) : 0;
      const level = Math.floor(t / DAY) > Math.floor(NOW / DAY) ? 'future' : `l${intensity}`;
      days.push(`<i class="${level}" title="${fmtDate(t)}: ${plural(n, 'commit')}"></i>`);
    }
    weeks.push(`<div>${days.join('')}</div>`);
  }
  return weeks.join('');
}

function render(login) {
  const p = D.people[login];
  $('#tab-person').classList.toggle('unknown', !p); // hides everything but the header
  if (!p) {
    $('#profileHead').innerHTML = `<div class="empty">Unknown person “${esc(login)}”. Pick someone in the Contributors tab.</div>`;
    return;
  }
  const commits = D.commits.filter((c) => c.a === login);
  const prs = D.prs.filter((pr) => pr.a === login);
  const merged = prs.filter((pr) => pr.m).sort((a, b) => ts(b.m) - ts(a.m));
  const openIssues = D.issues.filter((i) => i.s === 'open' && i.as.includes(login));
  const closedIssues = D.issues.filter((i) => isCompleted(i) && i.as.includes(login));
  const screens = D.units.map((u) => [u, screenRole(u, login)]).filter(([, role]) => role);

  $('#profileHead').innerHTML = `${avatar(login, 'lg')}
    <div><h2>${esc(p.name)}</h2>${extLink(`https://github.com/${login}`, `@${esc(login)} on GitHub ↗`, 'muted small')}</div>
    <a class="btn" href="#contributors">← All contributors</a>`;
  $('#profileKpis').innerHTML = kpis([
    ['Commits', fmtNum(commits.length)],
    ['PRs merged', merged.length],
    ['PRs open', prs.filter((pr) => pr.s === 'open').length],
    ['Issues solved', closedIssues.length],
    ['Lines changed', linesHtml(sumBy(commits, (c) => c.add), sumBy(commits, (c) => c.del))],
  ]);
  $('#profileCalendar').innerHTML = calendar(login);
  $('#profilePRs').innerHTML = listItems(prs.filter((pr) => pr.s === 'open'), prWithState, 'No open PR');
  $('#profileIssues').innerHTML = listItems(openIssues, issueRow, 'No assigned open issue');
  $('#profileScreens').innerHTML = listItems(screens, ([u, role]) =>
    `<li><a class="title" href="#screens/${encodeURIComponent(u.key)}">${esc(u.key)}</a><span class="muted small">${esc(u.feature)}</span><span class="pill">${role}</span></li>`, 'No screen');
  $('#profileMerged').innerHTML = listItems(merged.slice(0, 10), prWithState, 'No merged PR');
}

export default { id: 'person', label: 'Profile', hidden: true, html, setup() {}, render };
