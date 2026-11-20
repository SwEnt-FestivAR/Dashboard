// Reviews tab: per-person review charts and table, weekly line comments and open → close times, team-wide
// averages, who reviews whom, and PR sizes. Review data needs a token: the automatic GITHUB_TOKEN of GitHub
// Actions provides it on the deployed site (nothing to configure). Open → close times work without it.

import { $, DAY, css, fmtShortDate, plural } from '../core/utils.js';
import { D } from '../core/store.js';
import { card, chart, chartCard, chartOptions, kpis, peopleBarChart } from '../core/ui.js';
import { reviewerStats } from '../reviews/stats.js';
import { SIZES, overview, weeklyCloseTimes, weeklyLineComments } from '../reviews/flow.js';
import { matrixTable, overallTable, personTable } from '../reviews/tables.js';

/** "S < 100 · M < 400 · L < 1000 · XL more". */
const sizeLegend = SIZES.map(([s, max]) => (max === Infinity ? `${s} more` : `${s} &lt; ${max}`)).join(' · ');

const html = `
  <div class="card notice" id="reviewNotice" hidden>Review data comes from the GitHub GraphQL API, which needs a token.
    The deployed site gets one automatically from GitHub Actions (nothing to configure); locally, only open → close times are available.</div>
  <div class="kpis" id="reviewKpis"></div>
  <div class="grid3">
    ${chartCard('Reviews done', 'reviewedChart', 'reviews submitted on PRs of others')}
    ${chartCard('Wait before first review', 'waitChart', 'median on their PRs, hours')}
    ${chartCard('Request → review', 'answerChart', 'median from a request to their review, hours')}
  </div>
  <div class="grid2">
    ${chartCard('Line comments', 'commentsChart', 'inline review comments per week')}
    ${chartCard('Open → close', 'closeChart', 'PRs closed per week, days')}
  </div>
  ${card('Per person', '<div class="table-box" id="reviewPeople"></div>', 'hover a header for its definition')}
  <div class="grid2">
    ${card('Overall', '<div class="table-box" id="reviewOverall"></div>', 'over all PRs')}
    ${chartCard('PR sizes', 'sizeChart', `lines changed: ${sizeLegend}`)}
  </div>
  ${card('Who reviews whom', '<div class="matrix-box" id="reviewMatrix"></div>', 'rows review the PRs of columns')}`;

const hasReviews = () => D.prs.some((p) => p.rv);
const hours = (sec) => Math.round(sec / 3600);

function render() {
  const o = overview();
  const known = hasReviews();
  $('#reviewNotice').hidden = known;
  $('#reviewKpis').innerHTML = kpis([
    ['Reviews submitted', known ? o.reviews : '—'],
    ['Line comments', known ? o.lineComments : '—'],
    ['Merged unreviewed', known ? o.unreviewedMerged : '—', 'PRs without peer review'],
    ['XL PRs', known ? o.sizes.XL : '—', `≥ ${SIZES.at(-2)[1]} lines changed`],
  ]);

  const stats = reviewerStats();
  peopleBarChart('reviewedChart', stats.filter((s) => s.reviews).map((s) => [s.login, s.reviews]));
  const byHours = (key) => stats.filter((s) => s[key] != null).map((s) => [s.login, hours(s[key])]).sort((a, b) => b[1] - a[1]);
  peopleBarChart('waitChart', byHours('medianWait'));
  peopleBarChart('answerChart', byHours('medianAnswer'));
  renderWeeklyCharts();
  $('#reviewPeople').innerHTML = personTable(stats.filter((s) => s.reviews || s.ownCycle != null));
  $('#reviewOverall').innerHTML = overallTable(o);
  $('#reviewMatrix').innerHTML = matrixTable(stats.map((s) => s.login));
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

function renderWeeklyCharts() {
  const comments = weeklyLineComments();
  chart('commentsChart', {
    type: 'bar',
    data: {
      labels: comments.map((w) => fmtShortDate(w.week)),
      datasets: [{ data: comments.map((w) => w.n), backgroundColor: css('--accent'), borderRadius: 6 }],
    },
    options: chartOptions(),
  });
  const weeks = weeklyCloseTimes();
  const line = (label, key, colorToken) => ({
    label, data: weeks.map((w) => +(w[key] / DAY).toFixed(2)), borderColor: css(colorToken), backgroundColor: css(colorToken), tension: 0.3,
  });
  chart('closeChart', {
    type: 'line',
    data: { labels: weeks.map((w) => fmtShortDate(w.week)), datasets: [line('Mean', 'mean', '--accent'), line('Median', 'median', '--ok')] },
    options: chartOptions({
      legend: true, integers: false,
      tooltip: { callbacks: { footer: (items) => `${plural(weeks[items[0].dataIndex].n, 'PR')} closed` } },
    }),
  });
}

export default { id: 'reviews', label: 'Reviews', html, setup() {}, render };
