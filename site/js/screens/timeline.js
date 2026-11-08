// Gantt-style timeline of screens: one row per screen, from its first issue to today.
//   grey segment  = planned (first issue → first file created)
//   color segment = in the code, colored by current status (file created → finalized date, or today)
//   dots          = first issue ◦, file created ●, finalized ◆ (the `since` date of status.json)

import { DAY, esc, fmtDate, fmtShortDate, ts } from '../core/utils.js';
import { NOW, STATUS } from '../core/store.js';
import { statusInfo, unitId, unitIssues, unitStatus } from './units.js';

/** Key dates of a unit in unix seconds (null when unknown). */
function milestones(u) {
  const issueDates = unitIssues(u, true).map((i) => ts(i.c));
  const fileDates = [u.screen, u.viewModel].filter(Boolean).map((f) => f.created);
  const st = unitStatus(u);
  const done = st.status === 'finalized' ? ts(STATUS.screens[unitId(u)]?.since) : null;
  return {
    issue: issueDates.length ? Math.min(...issueDates) : null,
    created: fileDates.length ? Math.min(...fileDates) : null,
    done,
    status: st.status,
  };
}

/** Week ticks for the time axis: one label every `step` weeks so labels never overlap. */
function ticks(from, to) {
  const weeks = Math.ceil((to - from) / (7 * DAY));
  const step = Math.max(1, Math.ceil(weeks / 10));
  const out = [];
  for (let t = from; t <= to; t += step * 7 * DAY) out.push(t);
  return out;
}

/** HTML of the timeline for the given units (grouped by feature, in the order given). */
export function timelineHtml(units) {
  const rows = units.map((u) => ({ u, m: milestones(u) }));
  const starts = rows.flatMap(({ m }) => [m.issue, m.created]).filter(Boolean);
  if (!starts.length) return '<div class="empty">No dates to show</div>';
  const from = Math.min(...starts) - DAY, to = NOW + DAY;
  const x = (t) => `${(100 * (t - from)) / (to - from)}%`;
  const span = (a, b) => `left:${x(a)};width:calc(${x(b)} - ${x(a)})`;

  const axis = ticks(from, to).map((t) => `<span style="left:${x(t)}">${fmtShortDate(t)}</span>`).join('');
  let feature = null;
  const body = rows.map(({ u, m }) => {
    const color = `var(${statusInfo(m.status).css})`;
    const start = m.issue ?? m.created;
    const head = u.feature !== feature ? `<div class="tl-feature">${esc((feature = u.feature))}</div>` : '';
    const planned = m.issue && (!m.created || m.issue < m.created) ? `<i class="tl-plan" style="${span(m.issue, m.created ?? NOW)}"></i>` : '';
    const built = m.created ? `<i class="tl-bar" style="${span(m.created, m.done ?? NOW)};background:${color}"></i>` : '';
    const dot = (t, cls, label) => (t ? `<b class="tl-dot ${cls}" style="left:${x(t)}" title="${label} · ${fmtDate(t)}"></b>` : '');
    return `${head}<div class="tl-row">
      <a class="tl-name" href="#screens/${encodeURIComponent(u.key)}" title="${esc(statusInfo(m.status).label)}">${esc(u.key)}</a>
      <div class="tl-track" title="${esc(u.key)}: ${start ? `since ${fmtDate(start)}` : ''}">
        ${planned}${built}${dot(m.issue, 'issue', 'First issue')}${dot(m.created, 'created', 'File created')}${dot(m.done, 'done', 'Finalized')}
      </div></div>`;
  }).join('');
  return `<div class="card timeline">
    <div class="tl-row tl-axis"><span class="tl-name"></span>
      <div class="tl-track">${axis}<em class="tl-today" style="left:${x(NOW)}">today</em></div></div>
    ${body}
    <p class="muted small tl-legend">◦ first issue · ● file created · ◆ finalized — grey = planned, color = in the code (current status)</p>
  </div>`;
}
