// Gantt-style timeline of screens: one row per screen, one colored segment per status period (see
// statusPeriods() in units.js), so it shows from when to when a screen was planned, in development,
// developed or finalized. Dots: first issue ◦, first file created ●.

import { DAY, esc, fmtDate, fmtShortDate, ts } from '../core/utils.js';
import { NOW } from '../core/store.js';
import { STATUSES, statusInfo, statusPeriods, unitIssues, unitStatus } from './units.js';

/** Week ticks for the time axis: one label every `step` weeks so labels never overlap. */
function ticks(from, to) {
  const weeks = Math.ceil((to - from) / (7 * DAY));
  const step = Math.max(1, Math.ceil(weeks / 10));
  const out = [];
  for (let t = from; t <= to; t += step * 7 * DAY) out.push(t);
  return out;
}

/** Earliest of a list of unix dates, or null for an empty list. */
const earliest = (dates) => (dates.length ? Math.min(...dates) : null);

/** HTML of the timeline for the given units (grouped by feature, in the order given). */
export function timelineHtml(units) {
  const rows = units.map((u) => ({
    u,
    periods: statusPeriods(u),
    issue: earliest(unitIssues(u, true).map((i) => ts(i.c))),
    created: earliest([u.screen, u.viewModel].filter(Boolean).map((f) => f.created)),
  }));
  const starts = rows.flatMap((r) => [r.periods[0]?.from, r.issue, r.created]).filter(Boolean);
  if (!starts.length) return '<div class="empty">No dates to show</div>';
  const from = Math.min(...starts) - DAY, to = NOW + DAY;
  const x = (t) => `${(100 * (t - from)) / (to - from)}%`;
  const span = (a, b) => `left:${x(a)};width:calc(${x(b)} - ${x(a)})`;

  const axis = ticks(from, to).map((t) => `<span style="left:${x(t)}">${fmtShortDate(t)}</span>`).join('');
  let feature = null;
  const body = rows.map(({ u, periods, issue, created }) => {
    const head = u.feature !== feature ? `<div class="tl-feature">${esc((feature = u.feature))}</div>` : '';
    const bars = periods.map((p) => {
      const info = statusInfo(p.status);
      return `<i class="tl-bar ${p.status}" style="${span(p.from, p.to)};background:var(${info.css})"
        title="${info.label} · ${fmtDate(p.from)} → ${p.to >= NOW ? 'today' : fmtDate(p.to)}"></i>`;
    }).join('');
    const dot = (t, cls, label) => (t ? `<b class="tl-dot ${cls}" style="left:${x(t)}" title="${label} · ${fmtDate(t)}"></b>` : '');
    return `${head}<div class="tl-row">
      <a class="tl-name" href="#screens/${encodeURIComponent(u.key)}" title="${esc(statusInfo(unitStatus(u).status).label)}">${esc(u.key)}</a>
      <div class="tl-track">${bars}${dot(issue, 'issue', 'First issue')}${dot(created, 'created', 'First file created')}</div></div>`;
  }).join('');
  const legend = STATUSES.map((s) => `<span class="tl-key" style="--c:var(${s.css})">${s.label}</span>`).join('');
  return `<div class="card timeline">
    <div class="tl-row tl-axis"><span class="tl-name"></span>
      <div class="tl-track">${axis}<em class="tl-today" style="left:${x(NOW)}">today</em></div></div>
    ${body}
    <p class="muted small tl-legend">${legend} · ◦ first issue · ● first file created · hover a segment for its dates</p>
  </div>`;
}
