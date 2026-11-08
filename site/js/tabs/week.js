// This week tab: what happened in one week (Friday 12:00 → next Friday 12:00, see WEEK_START in utils.js),
// each person's issues and the unassigned ones (week/issues.js), with ← → navigation and a
// "Copy as Markdown" summary for meetings or Discord.

import { $, $$, DAY, addWeeks, countBy, esc, fmtWeekDay, plural, ts, weekStart } from '../core/utils.js';
import { D, NOW, P, nameOf, repoUrl } from '../core/store.js';
import { avatar, extLink, issueRow, kpis, listItems } from '../core/ui.js';
import { issuesByPerson, issuesMarkdown, peopleIssuesHtml, unassignedHtml, unassignedIssues } from '../week/issues.js';

const STALE_DAYS = 3;
const state = { offset: 0 }; // 0 = week containing NOW, 1 = the week before, …

const html = `
  <div class="toolbar">
    <div class="seg" id="weekNav"><button data-d="1" title="Previous week">←</button><button data-d="-1" title="Next week">→</button></div>
    <h2 id="weekTitle" class="week-title"></h2>
    <button id="weekCopy" class="btn">Copy as Markdown</button>
  </div>
  <div class="kpis" id="weekKpis"></div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Merged PRs</h3></div><ul class="issue-list" id="weekMerged"></ul></div>
    <div class="card"><div class="card-head"><h3>Closed issues</h3></div><ul class="issue-list" id="weekIssues"></ul></div>
    <div class="card"><div class="card-head"><h3>New screens</h3></div><ul class="issue-list" id="weekScreens"></ul></div>
    <div class="card"><div class="card-head"><h3>Most active</h3><span class="muted small">commits this week</span></div><ul class="issue-list" id="weekPeople"></ul></div>
  </div>
  <div class="card" id="weekStaleCard"><div class="card-head"><h3>Stale open PRs</h3><span class="muted small">no activity for ${STALE_DAYS}+ days</span></div><ul class="issue-list" id="weekStale"></ul></div>
  <div class="card"><div class="card-head"><h3>Issues per person</h3><span class="muted small">assigned now · closed during this week</span></div>
    <div class="people-issues" id="weekPeopleIssues"></div></div>
  <div class="card"><div class="card-head"><h3>Unassigned open issues</h3><span class="muted small">right now, oldest first</span></div>
    <div class="grid2" id="weekUnassigned"></div></div>`;

function setup() {
  for (const b of $$('#weekNav button')) {
    b.addEventListener('click', () => { state.offset = Math.max(0, state.offset + Number(b.dataset.d)); render(); });
  }
  $('#weekCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdown(weekData()));
      $('#weekCopy').textContent = 'Copied ✓';
    } catch {
      $('#weekCopy').textContent = 'Clipboard blocked';
    }
    setTimeout(() => ($('#weekCopy').textContent = 'Copy as Markdown'), 1500);
  });
}

/** Everything the tab shows for the selected week. */
function weekData() {
  const from = addWeeks(weekStart(NOW), -state.offset), to = addWeeks(from, 1);
  const inWeek = (t) => t >= from && t < to;
  const created = (u) => Math.min(...[u.screen, u.viewModel].filter((f) => f && !f.inPR).map((f) => f.created));
  return {
    from,
    to,
    current: state.offset === 0,
    merged: D.prs.filter((p) => inWeek(ts(p.m))),
    opened: D.prs.filter((p) => inWeek(ts(p.c))),
    closed: D.issues.filter((i) => i.s === 'closed' && i.r !== 'not_planned' && inWeek(ts(i.cl))),
    newScreens: D.units.filter((u) => !u.planned && inWeek(created(u))),
    commits: Object.entries(countBy(D.commits.filter((c) => inWeek(c.t)).map((c) => c.a))).sort((a, b) => b[1] - a[1]),
    stale: D.openPRs.filter((p) => NOW - ts(p.u) > STALE_DAYS * DAY),
    people: issuesByPerson(from, to),
    unassigned: unassignedIssues(),
  };
}

const prRow = (p) => `<li><span class="num">#${p.n}</span>${extLink(repoUrl(`/pull/${p.n}`), esc(p.title), 'title')}${avatar(p.a, 'sm')}</li>`;

function render() {
  const w = weekData();
  $('#weekTitle').textContent = `${fmtWeekDay(w.from)} → ${fmtWeekDay(w.to)}${w.current ? ' (current)' : ''}`;
  $('#weekNav button[data-d="-1"]').disabled = w.current;
  $('#weekKpis').innerHTML = kpis([
    ['Commits', w.commits.reduce((t, [, n]) => t + n, 0)],
    ['PRs merged', w.merged.length],
    ['PRs opened', w.opened.length],
    ['Issues closed', w.closed.length],
    ['New screens', w.newScreens.length],
  ]);
  $('#weekMerged').innerHTML = listItems(w.merged, prRow, 'No PR merged');
  $('#weekIssues').innerHTML = listItems(w.closed, issueRow, 'No issue closed');
  $('#weekScreens').innerHTML = listItems(w.newScreens, (u) => `<li><b class="title">${esc(u.key)}</b><span class="muted small">${esc(u.feature)}</span></li>`, 'No new screen');
  $('#weekPeople').innerHTML = listItems(w.commits, ([l, n]) => `<li>${avatar(l, 'sm')}<span class="title">${nameOf(l)}</span><b>${plural(n, 'commit')}</b></li>`, 'No commit');
  $('#weekStaleCard').hidden = !w.current; // "stale" only makes sense for the current week
  $('#weekStale').innerHTML = listItems(w.stale, prRow, 'No stale PR 🎉');
  $('#weekPeopleIssues').innerHTML = peopleIssuesHtml(w.people);
  $('#weekUnassigned').innerHTML = unassignedHtml(w.unassigned);
}

/** Plain-text summary of the week, ready to paste. */
function markdown(w) {
  const section = (title, items, line) => (items.length ? `\n### ${title}\n${items.map(line).join('\n')}\n` : '');
  const pr = (p) => `- #${p.n} ${p.title} (@${p.a})`;
  return `## FestivAR — ${fmtWeekDay(w.from)} → ${fmtWeekDay(w.to)}
**${plural(w.merged.length, 'PR')} merged · ${plural(w.closed.length, 'issue')} closed · ${plural(w.newScreens.length, 'new screen')}**
${section('Merged PRs', w.merged, pr)}${section('Closed issues', w.closed, (i) => `- #${i.n} ${i.title}${i.as.length ? ` (${i.as.map((a) => `@${a}`).join(', ')})` : ''}`)}${section('New screens', w.newScreens, (u) => `- ${u.key} (${u.feature})`)}${section('Most active', w.commits, ([l, n]) => `- ${P(l).name}: ${plural(n, 'commit')}`)}${w.current ? section('Stale open PRs', w.stale, pr) : ''}${issuesMarkdown(w.people, w.unassigned)}`;
}

export default { id: 'week', label: 'This week', html, setup, render };
