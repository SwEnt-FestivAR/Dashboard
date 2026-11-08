// Reviews tab: who reviews how much, who reviews whom, how long PRs wait, and PR cycle time and size.
// Review data needs a token: the automatic GITHUB_TOKEN of GitHub Actions provides it on the deployed site
// (nothing to configure). Cycle time works without it.

import { $, DAY, css, esc, fmtDuration, fmtShortDate, plural } from '../core/utils.js';
import { D, P } from '../core/store.js';
import { avatar, card, chart, chartCard, chartOptions, kpis, peopleBarChart } from '../core/ui.js';
import { SIZES, overview, reviewMatrix, reviewerStats, weeklyCycleTime } from '../reviews/stats.js';

/** "S < 100 · M < 400 · L < 1000 · XL more". */
const sizeLegend = SIZES.map(([s, max]) => (max === Infinity ? `${s} more` : `${s} &lt; ${max}`)).join(' · ');

const html = `
  <div class="card notice" id="reviewNotice" hidden>Review data comes from the GitHub GraphQL API, which needs a token.
    The deployed site gets one automatically from GitHub Actions (nothing to configure); locally, only cycle time is available.</div>
  <div class="kpis" id="reviewKpis"></div>
  <div class="grid2">
    ${chartCard('PRs reviewed per person', 'reviewedChart', 'distinct PRs of others')}
    ${chartCard('Wait before first review', 'waitChart', 'median on their PRs, hours')}
  </div>
  ${card('Who reviews whom', '<div class="matrix-box" id="reviewMatrix"></div>', 'rows review the PRs of columns')}
  <div class="grid2">
    ${chartCard('Cycle time', 'cycleChart', 'median open → merge per week, days')}
    ${chartCard('PR sizes', 'sizeChart', `lines changed: ${sizeLegend}`)}
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
  const sizeColors = ['--ok', '--info', '--warn', '--bad'].map(css); // S → XL, green to red
  chart('sizeChart', {
    type: 'bar',
    data: {
      labels: SIZES.map(([s]) => s),
      datasets: [{ data: SIZES.map(([s]) => o.sizes[s]), backgroundColor: sizeColors, borderRadius: 6 }],
    },
    options: chartOptions(),
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
  const days = weeks.map((w) => +(w.cycle / DAY).toFixed(2));
  chart('cycleChart', {
    type: 'line',
    data: {
      labels: weeks.map((w) => fmtShortDate(w.week)),
      datasets: [{ data: days, borderColor: css('--accent'), backgroundColor: css('--accent-soft'), fill: true, tension: 0.3 }],
    },
    options: chartOptions({
      integers: false,
      tooltip: { callbacks: { afterLabel: (c) => plural(weeks[c.dataIndex].n, 'PR') + ' merged' } },
    }),
  });
}

export default { id: 'reviews', label: 'Reviews', html, setup() {}, render };
