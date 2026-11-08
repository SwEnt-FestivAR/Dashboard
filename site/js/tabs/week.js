// This week tab: what happened in one week (Friday 12:00 → next Friday 12:00, see WEEK_START in utils.js),
// each person's issues and the unassigned ones (week/issues.js), with ← → navigation and a
// "Copy as Markdown" summary for meetings or Discord.

import { $, $$, DAY, addWeeks, countBy, esc, fmtWeekDay, plural, sumBy, ts, weekStart } from '../core/utils.js';
import { D, NOW, P, isCompleted, nameOf } from '../core/store.js';
import { avatar, card, issueRow, kpis, listCard, listItems, prRow } from '../core/ui.js';
import { issuesByPerson, issuesMarkdown, peopleIssuesHtml, unassignedHtml, unassignedIssues } from '../week/issues.js';

const STALE_DAYS = 3;
const state = { offset: 0 }; // 0 = week containing NOW, 1 = the week before, …

const html = `
  <div class="toolbar">
    <div class="seg" id="weekNav">
      <button data-d="1" title="Previous week">←</button><button data-d="-1" title="Next week">→</button>
    </div>
    <h2 id="weekTitle" class="week-title"></h2>
    <button id="weekCopy" class="btn">Copy as Markdown</button>
  </div>
  <div class="kpis" id="weekKpis"></div>
  <div class="grid2">
    ${listCard('Merged PRs', 'weekMerged')}
    ${listCard('Closed issues', 'weekIssues')}
    ${listCard('New screens', 'weekScreens')}
    ${listCard('Most active', 'weekPeople', 'commits this week')}
  </div>
  <div id="weekStaleCard">${listCard('Stale open PRs', 'weekStale', `no activity for ${STALE_DAYS}+ days`)}</div>
  ${card('Issues per person', '<div class="people-issues" id="weekPeopleIssues"></div>', 'assigned now · closed during this week')}
  ${card('Unassigned open issues', '<div class="grid2" id="weekUnassigned"></div>', 'right now, oldest first')}`;

function setup() {
  for (const b of $$('#weekNav button')) {
    b.addEventListener('click', () => {
      state.offset = Math.max(0, state.offset + Number(b.dataset.d));
      render();
    });
  }
  $('#weekCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdown(weekData()));
      $('#weekCopy').textContent = 'Copied ✓';
    } catch {
      $('#weekCopy').textContent = 'Clipboard blocked'; // e.g. page not focused or permission denied
    }
    setTimeout(() => ($('#weekCopy').textContent = 'Copy as Markdown'), 1500);
  });
}

/** Everything the tab shows for the selected week. */
function weekData() {
  const from = addWeeks(weekStart(NOW), -state.offset), to = addWeeks(from, 1);
  const inWeek = (t) => t >= from && t < to;
  const created = (u) => Math.min(...[u.screen, u.viewModel].filter((f) => f && !f.inPR).map((f) => f.created));
  const commitsPerPerson = countBy(D.commits.filter((c) => inWeek(c.t)).map((c) => c.a));
  return {
    from,
    to,
    current: state.offset === 0,
    merged: D.prs.filter((p) => inWeek(ts(p.m))),
    opened: D.prs.filter((p) => inWeek(ts(p.c))),
    closed: D.issues.filter((i) => isCompleted(i) && inWeek(ts(i.cl))),
    newScreens: D.units.filter((u) => !u.planned && inWeek(created(u))),
    commits: Object.entries(commitsPerPerson).sort((a, b) => b[1] - a[1]),
    stale: D.openPRs.filter((p) => NOW - ts(p.u) > STALE_DAYS * DAY),
    people: issuesByPerson(from, to),
    unassigned: unassignedIssues(),
  };
}

const prWithAuthor = (p) => prRow(p, avatar(p.a, 'sm'));
const screenRow = (u) => `<li><b class="title">${esc(u.key)}</b><span class="muted small">${esc(u.feature)}</span></li>`;
const committerRow = ([login, n]) => `<li>${avatar(login, 'sm')}<span class="title">${nameOf(login)}</span><b>${plural(n, 'commit')}</b></li>`;

function render() {
  const w = weekData();
  $('#weekTitle').textContent = `${fmtWeekDay(w.from)} → ${fmtWeekDay(w.to)}${w.current ? ' (current)' : ''}`;
  $('#weekNav button[data-d="-1"]').disabled = w.current;
  $('#weekKpis').innerHTML = kpis([
    ['Commits', sumBy(w.commits, ([, n]) => n)],
    ['PRs merged', w.merged.length],
    ['PRs opened', w.opened.length],
    ['Issues closed', w.closed.length],
    ['New screens', w.newScreens.length],
  ]);
  $('#weekMerged').innerHTML = listItems(w.merged, prWithAuthor, 'No PR merged');
  $('#weekIssues').innerHTML = listItems(w.closed, issueRow, 'No issue closed');
  $('#weekScreens').innerHTML = listItems(w.newScreens, screenRow, 'No new screen');
  $('#weekPeople').innerHTML = listItems(w.commits, committerRow, 'No commit');
  $('#weekStaleCard').hidden = !w.current; // "stale" only makes sense for the current week
  $('#weekStale').innerHTML = listItems(w.stale, prWithAuthor, 'No stale PR 🎉');
  $('#weekPeopleIssues').innerHTML = peopleIssuesHtml(w.people);
  $('#weekUnassigned').innerHTML = unassignedHtml(w.unassigned);
}

/** Markdown section "### title" with one line per item, or nothing when there are no items. */
const mdSection = (title, items, line) => (items.length ? `### ${title}\n${items.map(line).join('\n')}` : '');

/** Plain-text summary of the week, ready to paste in a meeting or on Discord. */
function markdown(w) {
  const pr = (p) => `- #${p.n} ${p.title} (@${p.a})`;
  const issue = (i) => `- #${i.n} ${i.title}${i.as.length ? ` (${i.as.map((a) => `@${a}`).join(', ')})` : ''}`;
  const totals = [plural(w.merged.length, 'PR') + ' merged', plural(w.closed.length, 'issue') + ' closed',
    plural(w.newScreens.length, 'new screen')].join(' · ');
  return [
    `## FestivAR — ${fmtWeekDay(w.from)} → ${fmtWeekDay(w.to)}`,
    `**${totals}**`,
    mdSection('Merged PRs', w.merged, pr),
    mdSection('Closed issues', w.closed, issue),
    mdSection('New screens', w.newScreens, (u) => `- ${u.key} (${u.feature})`),
    mdSection('Most active', w.commits, ([login, n]) => `- ${P(login).name}: ${plural(n, 'commit')}`),
    w.current ? mdSection('Stale open PRs', w.stale, pr) : '',
    issuesMarkdown(w.people, w.unassigned).trim(),
  ].filter(Boolean).join('\n\n');
}

export default { id: 'week', label: 'This week', html, setup, render };
