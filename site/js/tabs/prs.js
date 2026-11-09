// Open PRs tab: KPIs and a kanban of open PRs. The last column holds the PRs approved during the current
// week (Friday 12:00 → Friday 12:00), merged ones included; older approvals go back to "Needs review".
// The review columns need review data, which only exists when the fetch had a token (D.hasToken).

import { $, DAY, addWeeks, esc, fmtWeekDay, sumBy, ts, uniq, weekStart } from '../core/utils.js';
import { D, NOW, ago, nameOf } from '../core/store.js';
import { avatar, fillPeopleSelect, kpis, linesHtml, prLink } from '../core/ui.js';
import { approvalTimes, reviewersOf } from '../reviews/stats.js';

const STALE_DAYS = 3;

const html = `
  <div class="kpis" id="prKpis"></div>
  <div class="toolbar">
    <select id="prAuthor"><option value="">All authors</option></select>
    <label class="check"><input type="checkbox" id="staleOnly"> Stale only (&gt; ${STALE_DAYS} days without activity)</label>
  </div>
  <div class="kanban" id="kanban"></div>`;

/** Columns for the open PRs that were not approved this week: [title, predicate]. */
const columns = () => (D.hasToken
  ? [
    ['Draft', (p) => p.d],
    ['Needs review', (p) => !p.d && p.review !== 'changes'],
    ['Changes requested', (p) => !p.d && p.review === 'changes'],
  ]
  : [['Draft', (p) => p.d], ['Ready for review', (p) => !p.d]]);

const isStale = (p) => NOW - ts(p.u) > STALE_DAYS * DAY;

/** PRs (open or merged) with a peer approval during the current week, latest approval first, with `approvedAt`. */
function approvedThisWeek() {
  const from = weekStart(NOW), to = addWeeks(from, 1);
  return D.prs
    .filter((p) => p.s === 'open' || p.m)
    .map((p) => ({ ...p, approvedAt: Math.max(0, ...approvalTimes(p).filter((t) => t >= from && t < to)) }))
    .filter((p) => p.approvedAt)
    .sort((a, b) => b.approvedAt - a.approvedAt);
}

const column = (title, cards, sub = '') => `<div class="col">
  <div class="col-head"><span>${title}${sub ? `<br><span class="muted small">${sub}</span>` : ''}</span><span class="pill">${cards.length}</span></div>
  ${cards.join('') || '<div class="empty small">Nothing here</div>'}</div>`;

function setup() {
  fillPeopleSelect('#prAuthor', uniq(D.openPRs.map((p) => p.a)).sort());
  for (const sel of ['#prAuthor', '#staleOnly']) $(sel).addEventListener('input', () => render());
}

function render() {
  const all = D.openPRs;
  const approved = D.hasToken ? approvedThisWeek() : [];
  const avgAgeDays = all.length ? sumBy(all, (p) => NOW - ts(p.c)) / all.length / DAY : 0;
  $('#prKpis').innerHTML = kpis([
    ['Open PRs', all.length],
    ['Drafts', all.filter((p) => p.d).length],
    ['Ready for review', all.filter((p) => !p.d).length],
    [`Stale (> ${STALE_DAYS} days)`, all.filter(isStale).length],
    ...(D.hasToken ? [['Approved this week', approved.length]] : []),
    ['Average age', `${avgAgeDays.toFixed(1)} d`],
  ]);

  const author = $('#prAuthor').value, staleOnly = $('#staleOnly').checked;
  const keep = (p) => (!author || p.a === author) && (!staleOnly || (p.s === 'open' && isStale(p)));
  const approvedNumbers = new Set(approved.map((p) => p.n));
  const open = all.filter((p) => keep(p) && !approvedNumbers.has(p.n));
  const cols = columns().map(([title, inColumn]) =>
    column(title, open.filter(inColumn).sort((a, b) => ts(a.u) - ts(b.u)).map((p) => prCard(p)))); // least recently updated first
  if (D.hasToken) cols.push(column('Approved this week', approved.filter(keep).map(approvedCard), `since ${fmtWeekDay(weekStart(NOW))}`));
  $('#kanban').style.gridTemplateColumns = `repeat(${cols.length}, minmax(240px, 1fr))`;
  $('#kanban').innerHTML = cols.join('');
}

const CI_PILLS = {
  success: '<span class="pill ok">CI ✓</span>',
  failure: '<span class="pill bad">CI ✗</span>',
  pending: '<span class="pill warn">CI …</span>',
};

// How each review state is shown: [pill class, icon, words for the tooltip]
const REVIEW_STATES = {
  A: ['ok', '✓', 'approved'],
  C: ['bad', '✗', 'requested changes'],
  R: ['', '💬', 'commented'],
  requested: ['warn', '⏳', 'review requested, not done yet'],
};

/** Last row of every card: one pill per reviewer, with their avatar and the state of their review. */
function reviewersRow(n) {
  const reviewers = reviewersOf(n);
  const pills = reviewers.map(({ login, state }) => {
    const [cls, icon, words] = REVIEW_STATES[state];
    return `<span class="pill ${cls}" title="${nameOf(login)}: ${words}">${avatar(login, 'xs')}${icon}</span>`;
  }).join('');
  return `<div class="row reviewers">Reviewers: ${pills || '<span class="muted">none yet</span>'}</div>`;
}

/** Card of a PR approved this week: the full open-PR card, or a short card once merged. */
function approvedCard(p) {
  const approval = `<div class="row">Approved ${ago(p.approvedAt)}</div>`;
  const openPR = D.openPRs.find((o) => o.n === p.n);
  if (openPR) return prCard(openPR, approval);
  return `<div class="pr">
    ${prLink(p)}
    <div class="row">${avatar(p.a, 'xs')} ${nameOf(p.a)} · <span class="pill ok">merged ${ago(ts(p.m))}</span></div>
    ${approval}
    ${reviewersRow(p.n)}
  </div>`;
}

/** Card of an open PR; `extra` is HTML added just above the reviewers row (e.g. the approval date). */
function prCard(p, extra = '') {
  const stale = isStale(p);
  const add = sumBy(p.files, (f) => f.add), del = sumBy(p.files, (f) => f.del);
  const activity = stale ? `<span class="pill warn">⏰ idle ${ago(ts(p.u)).replace(' ago', '')}</span>` : `<span>updated ${ago(ts(p.u))}</span>`;
  return `<div class="pr ${stale ? 'stale' : ''}">
    ${prLink(p)}
    <div class="row">${avatar(p.a, 'xs')} ${nameOf(p.a)} · opened ${ago(ts(p.c))}</div>
    <div class="row">${activity} ${CI_PILLS[p.ci] || ''}
      <span>${linesHtml(add, del)} · ${p.files.length} files</span></div>
    ${p.screens?.length ? `<div class="row">${p.screens.map((s) => `<a class="pill" href="#screens">${esc(s.split('/')[1])}</a>`).join('')}</div>` : ''}
    ${extra}
    ${reviewersRow(p.n)}
  </div>`;
}

export default { id: 'prs', label: 'Open PRs', html, setup, render };
