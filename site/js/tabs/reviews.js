// Reviews tab: per-person review charts and table, weekly line comments and PR closing times, team-wide
// averages, who reviews whom, and PR sizes. Review data needs a token: the automatic GITHUB_TOKEN of GitHub
// Actions provides it on the deployed site (nothing to configure). Open → close times work without it.

import { $, DAY, css, fmtShortDate, plural } from '../core/utils.js';
import { D } from '../core/store.js';
import { card, chart, chartBox, chartOptions, kpis, peopleBarChart } from '../core/ui.js';
import { reviewerStats } from '../reviews/stats.js';
import { SIZES, overview, weeklyCloseTimes, weeklyLineComments } from '../reviews/flow.js';
import { matrixTable, overallTable, personTable } from '../reviews/tables.js';

/** "S (under 100) · M (under 400) · L (under 1000) · XL (1000 or more)". */
const sizeLegend = SIZES.map(([s, max], i) => (max === Infinity ? `${s} (${SIZES[i - 1][1]} or more)` : `${s} (under ${max})`)).join(' · ');

/** A card whose body starts with a sentence saying what it shows and how to read it. */
const explained = (title, sentence, body) => card(title, `<p class="muted small explain">${sentence}</p>${body}`);

const html = `
  <div class="card notice" id="reviewNotice" hidden>Review data comes from the GitHub GraphQL API, which needs a token.
    The deployed site gets one automatically from GitHub Actions (nothing to configure); locally, only PR closing times are available.</div>
  <div class="kpis" id="reviewKpis"></div>
  <div class="grid3">
    ${explained('Reviews given', `How many reviews each person submitted on <b>other people's</b> PRs (approve, request changes
      or comment). Two reviews on the same PR count twice.`, chartBox('reviewedChart'))}
    ${explained('Waiting for a first review', `For the PRs <b>this person opened</b>: median time, in hours, between the PR being
      ready for review (opened, or taken out of draft) and the first review by someone else. A long bar means their PRs
      wait long. Time spent as a draft is not counted.`, chartBox('waitChart'))}
    ${explained('Answering review requests', `Median time, in hours, between someone <b>asking this person</b> for a review and
      this person submitting it. A short bar means they answer fast. Requests never answered are not counted.`, chartBox('answerChart'))}
  </div>
  <div class="grid2">
    ${explained('Line comments per week', `Comments written <b>on a specific line of code</b> during reviews, per week
      (Friday 12:00 → Friday 12:00). General review comments are not counted.`, chartBox('commentsChart'))}
    ${explained('Time to close a PR, per week', `For the PRs closed each week (merged or not): average and median time, in days,
      between being ready for review (opened, or taken out of draft) and closing. Drafts are left out. The median is the typical PR; the average is pulled up by a few PRs that stayed open long.`,
      chartBox('closeChart'))}
  </div>
  ${explained('Review stats per person', 'One row per person. What each column means is explained under the table.',
    '<div class="table-box" id="reviewPeople"></div>')}
  <div class="grid2">
    ${explained('Team averages', `Over all PRs of the team. The <b>mean</b> is the plain average; the <b>median</b> is the value
      in the middle, i.e. the typical PR, not pulled up by a few extreme ones.`, '<div class="table-box" id="reviewOverall"></div>')}
    ${explained('PR sizes', `Number of PRs by lines changed (added + deleted): ${sizeLegend}. Small PRs are reviewed faster
      and better.`, chartBox('sizeChart'))}
  </div>
  ${explained('Who reviews whom', `Each cell is how many PRs of the person in the <b>column</b> were reviewed by the person in the
    <b>row</b>; darker means more. An empty row is someone who never reviews; an empty column, someone never reviewed.`,
    '<div class="matrix-box" id="reviewMatrix"></div>')}`;

const hasReviews = () => D.prs.some((p) => p.rv);
const hours = (sec) => Math.round(sec / 360) / 10; // one decimal, so 20 minutes shows as 0.3 h, not 0

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
