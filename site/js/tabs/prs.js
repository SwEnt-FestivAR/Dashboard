// Open PRs tab: KPIs and a kanban of open PRs. The review columns need review data, which only exists
// when the fetch script ran with a GITHUB_TOKEN (D.hasToken).

import { $, DAY, esc, fmtNum, ts, uniq } from '../core/utils.js';
import { D, NOW, ago, nameOf, repoUrl } from '../core/store.js';
import { avatar, avatars, extLink, fillPeopleSelect, kpis } from '../core/ui.js';

const STALE_DAYS = 3;

const html = `
  <div class="kpis" id="prKpis"></div>
  <div class="toolbar">
    <select id="prAuthor"><option value="">All authors</option></select>
    <label class="check"><input type="checkbox" id="staleOnly"> Stale only (&gt; ${STALE_DAYS} days without activity)</label>
  </div>
  <div class="kanban" id="kanban"></div>`;

/** Kanban columns: [title, predicate]. */
const columns = () => (D.hasToken
  ? [
    ['Draft', (p) => p.d],
    ['Needs review', (p) => !p.d && !['approved', 'changes'].includes(p.review)],
    ['Changes requested', (p) => !p.d && p.review === 'changes'],
    ['Approved', (p) => !p.d && p.review === 'approved'],
  ]
  : [['Draft', (p) => p.d], ['Ready for review', (p) => !p.d]]);

const isStale = (p) => NOW - ts(p.u) > STALE_DAYS * DAY;

function setup() {
  fillPeopleSelect('#prAuthor', uniq(D.openPRs.map((p) => p.a)).sort());
  for (const sel of ['#prAuthor', '#staleOnly']) $(sel).addEventListener('input', render);
}

function render() {
  const all = D.openPRs;
  const avgAgeDays = all.length ? all.reduce((t, p) => t + (NOW - ts(p.c)), 0) / all.length / DAY : 0;
  $('#prKpis').innerHTML = kpis([
    ['Open PRs', all.length],
    ['Drafts', all.filter((p) => p.d).length],
    ['Ready for review', all.filter((p) => !p.d).length],
    [`Stale (> ${STALE_DAYS} days)`, all.filter(isStale).length],
    ['Average age', `${avgAgeDays.toFixed(1)} d`],
  ]);

  const author = $('#prAuthor').value, staleOnly = $('#staleOnly').checked;
  const prs = all.filter((p) => (!author || p.a === author) && (!staleOnly || isStale(p)));
  const cols = columns();
  $('#kanban').style.gridTemplateColumns = `repeat(${cols.length}, minmax(240px, 1fr))`;
  $('#kanban').innerHTML = cols.map(([title, keep]) => {
    const list = prs.filter(keep).sort((a, b) => ts(a.u) - ts(b.u)); // least recently updated first
    return `<div class="col"><div class="col-head">${title}<span class="pill">${list.length}</span></div>
      ${list.map(prCard).join('') || '<div class="empty small">Nothing here</div>'}</div>`;
  }).join('');
}

const CI_PILLS = { success: '<span class="pill ok">CI ✓</span>', failure: '<span class="pill bad">CI ✗</span>', pending: '<span class="pill warn">CI …</span>' };

function prCard(p) {
  const stale = isStale(p);
  const add = p.files.reduce((t, f) => t + f.add, 0), del = p.files.reduce((t, f) => t + f.del, 0);
  const activity = stale ? `<span class="pill warn">⏰ idle ${ago(ts(p.u)).replace(' ago', '')}</span>` : `<span>updated ${ago(ts(p.u))}</span>`;
  return `<div class="pr ${stale ? 'stale' : ''}">
    ${extLink(repoUrl(`/pull/${p.n}`), `<span class="muted">#${p.n}</span> ${esc(p.title)}`, 't')}
    <div class="row">${avatar(p.a, 'xs')} ${nameOf(p.a)} · opened ${ago(ts(p.c))}</div>
    <div class="row">${activity} ${CI_PILLS[p.ci] || ''}
      <span><span class="plus">+${fmtNum(add)}</span> <span class="minus">−${fmtNum(del)}</span> · ${p.files.length} files</span></div>
    ${p.reviewers.length ? `<div class="row">Review requested: ${avatars(p.reviewers)}</div>` : ''}
    ${p.screens?.length ? `<div class="row">${p.screens.map((s) => `<a class="pill" href="#screens">${esc(s.split('/')[1])}</a>`).join('')}</div>` : ''}
  </div>`;
}

export default { id: 'prs', label: 'Open PRs', html, setup, render };
