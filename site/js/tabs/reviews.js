// Reviews tab: who reviews how much, who reviews whom, how long PRs wait, and PR cycle time and size.
// Review data needs a token: the automatic GITHUB_TOKEN of GitHub Actions provides it on the deployed site
// (nothing to configure). Cycle time works without it.

import { $, esc, fmtDuration } from '../core/utils.js';
import { D, P } from '../core/store.js';
import { avatar, chart, kpis, peopleBarChart } from '../core/ui.js';
import { SIZES, overview, reviewMatrix, reviewerStats, weeklyCycleTime } from '../reviews/stats.js';

const html = `
  <div class="card notice" id="reviewNotice" hidden>Review data comes from the GitHub GraphQL API, which needs a token.
    The deployed site gets one automatically from GitHub Actions (nothing to configure); locally, only cycle time is available.</div>
  <div class="kpis" id="reviewKpis"></div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>PRs reviewed per person</h3><span class="muted small">distinct PRs of others</span></div>
      <div class="chart-box"><canvas id="reviewedChart"></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Wait before first review</h3><span class="muted small">median on their PRs, hours</span></div>
      <div class="chart-box"><canvas id="waitChart"></canvas></div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Who reviews whom</h3><span class="muted small">rows review the PRs of columns</span></div>
    <div class="matrix-box" id="reviewMatrix"></div></div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Cycle time</h3><span class="muted small">median open → merge per week, days</span></div>
      <div class="chart-box"><canvas id="cycleChart"></canvas></div></div>
    <div class="card"><div class="card-head"><h3>PR sizes</h3><span class="muted small">lines changed: ${SIZES.map(([s, max]) => (max === Infinity ? `${s} more` : `${s} &lt; ${max}`)).join(' · ')}</span></div>
      <div class="chart-box"><canvas id="sizeChart"></canvas></div></div>
  </div>`;

const hasReviews = () => D.prs.some((p) => p.rv);

function render() {
  const o = overview();
  $('#reviewNotice').hidden = hasReviews();
  $('#reviewKpis').innerHTML = kpis([
    ['Reviews submitted', hasReviews() ? o.reviews : '—'],
    ['Wait for 1st review', fmtDuration(o.medianWait), 'median'],
    ['Cycle time', fmtDuration(o.medianCycle), 'median open → merge'],
    ['Merged unreviewed', hasReviews() ? o.unreviewedMerged : '—', 'PRs without peer review'],
    ['XL PRs', hasReviews() ? o.sizes.XL : '—', `≥ ${SIZES.at(-2)[1]} lines changed`],
  ]);

  const stats = reviewerStats();
  peopleBarChart('reviewedChart', stats.map((s) => [s.login, s.reviewed]));
  peopleBarChart('waitChart', stats.filter((s) => s.medianWait != null)
    .map((s) => [s.login, Math.round(s.medianWait / 3600)]).sort((a, b) => b[1] - a[1]));
  $('#reviewMatrix').innerHTML = matrixTable(stats.map((s) => s.login));
  renderCycleChart();
  chart('sizeChart', {
    type: 'bar',
    data: { labels: SIZES.map(([s]) => s), datasets: [{ data: SIZES.map(([s]) => o.sizes[s]), backgroundColor: ['#10b981', '#0ea5e9', '#f59e0b', '#f43f5e'], borderRadius: 6 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
  });
}

/** Heatmap table: cell opacity grows with the count; the diagonal (self) is greyed out. */
function matrixTable(logins) {
  const m = reviewMatrix();
  const max = Math.max(1, ...Object.values(m).flatMap((row) => Object.values(row)));
  if (!Object.keys(m).length) return '<div class="empty">No review data yet</div>';
  const head = logins.map((l) => `<th>${avatar(l, 'sm')}</th>`).join('');
  const rows = logins.map((r) => `<tr><th class="who">${avatar(r, 'sm')}${esc(P(r).name)}</th>${logins.map((a) => {
    if (a === r) return '<td class="self"></td>';
    const n = m[r]?.[a] || 0;
    return `<td style="--k:${n / max}" title="${esc(P(r).name)} reviewed ${n} PR(s) of ${esc(P(a).name)}">${n || ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCycleChart() {
  const weeks = weeklyCycleTime();
  chart('cycleChart', {
    type: 'line',
    data: {
      labels: weeks.map((w) => new Date(w.week * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      datasets: [{ data: weeks.map((w) => +(w.cycle / 86400).toFixed(2)), borderColor: '#6d4aff', backgroundColor: 'rgba(109,74,255,.15)', fill: true, tension: 0.3 }],
    },
    options: {
      maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (c) => `${weeks[c.dataIndex].n} PRs merged` } } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
    },
  });
}

export default { id: 'reviews', label: 'Reviews', html, setup() {}, render };
