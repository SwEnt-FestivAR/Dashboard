// Milestones tab: progress per milestone, open issues per person, unassigned issues, and the issue list
// of the selected milestone.

import { $, $$, countBy, esc, fmtDate, seg, ts } from '../core/utils.js';
import { D, NOW } from '../core/store.js';
import { chartCard, issueRow, listItems, peopleBarChart } from '../core/ui.js';

const state = {
  selected: null,     // title of the selected milestone
  issueState: 'open', // open | closed, for the issue list
};

const html = `
  <div class="milestones" id="milestoneCards"></div>
  <div class="grid2">
    ${chartCard('Open issues per person', 'loadChart', 'current load')}
    <div class="card">
      <div class="card-head"><h3>Unassigned open issues</h3><span id="unassignedCount" class="pill"></span></div>
      <ul class="issue-list" id="unassigned"></ul>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3 id="msIssuesTitle">Issues</h3>
      <div class="seg small" id="msIssueState"><button data-s="open" class="on">Open</button><button data-s="closed">Closed</button></div>
    </div>
    <ul class="issue-list" id="msIssues"></ul>
  </div>`;

function setup() {
  seg('#msIssueState', 's', (s) => { state.issueState = s; renderIssues(); });
}

const NO_MILESTONE = 'No milestone';
const issuesOf = (title) => D.issues.filter((i) => (title === NO_MILESTONE ? !i.ms : i.ms === title));

/**
 * Milestones plus a "No milestone" pseudo-milestone, open ones first. Counts come from the issue list
 * because the API's counts also include PRs.
 */
function milestones() {
  const list = D.milestones.map((m) => ({ title: m.title, state: m.state, due: m.due }));
  if (issuesOf(NO_MILESTONE).length) list.push({ title: NO_MILESTONE, state: 'open' });
  for (const m of list) {
    const issues = issuesOf(m.title);
    m.closed = issues.filter((i) => i.s === 'closed').length;
    m.total = issues.length;
  }
  const openFirst = (m) => (m.state === 'open' ? 0 : 1);
  return list.sort((a, b) => openFirst(a) - openFirst(b) || a.title.localeCompare(b.title));
}

function render() {
  const list = milestones();
  state.selected ??= (list.find((m) => m.state === 'open' && m.title !== NO_MILESTONE) || list[0])?.title;
  $('#milestoneCards').innerHTML = list.map(milestoneCard).join('');
  for (const el of $$('.ms')) el.addEventListener('click', () => { state.selected = el.dataset.ms; render(); });

  const open = D.issues.filter((i) => i.s === 'open');
  peopleBarChart('loadChart', Object.entries(countBy(open.flatMap((i) => i.as))).sort((a, b) => b[1] - a[1]));
  const unassigned = open.filter((i) => !i.as.length);
  $('#unassignedCount').textContent = unassigned.length;
  $('#unassigned').innerHTML = listItems(unassigned, issueRow, 'Every open issue has an owner 🎉');
  renderIssues();
}

/** Due date of a milestone, in red when it is past and the milestone is still open. */
function dueLabel(m) {
  const due = ts(m.due);
  if (!due) return '';
  if (due < NOW && m.state === 'open') return `<span class="pill bad">overdue · ${fmtDate(due)}</span>`;
  return `<span class="muted small">due ${fmtDate(due)}</span>`;
}

function milestoneCard(m) {
  const pct = m.total ? Math.round((100 * m.closed) / m.total) : 0;
  return `<div class="card ms ${state.selected === m.title ? 'on' : ''}" data-ms="${esc(m.title)}">
    <h3>${esc(m.title)} <span class="pill ${m.state === 'open' ? 'info' : 'ok'}">${m.state}</span></h3>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="ms-foot"><span><b>${pct}%</b> <span class="muted small">${m.closed} closed / ${m.total}</span></span>${dueLabel(m)}</div>
  </div>`;
}

function renderIssues() {
  const list = issuesOf(state.selected).filter((i) => i.s === state.issueState);
  $('#msIssuesTitle').textContent = `Issues · ${state.selected || ''} (${list.length})`;
  $('#msIssues').innerHTML = listItems(list, issueRow, 'No issue');
}

export default { id: 'milestones', label: 'Milestones', html, setup, render };
