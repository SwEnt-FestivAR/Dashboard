// Contributors tab: KPIs, one card per person, and charts, filtered by period.

import { $, $$, DAY, addWeeks, css, esc, fmtNum, fmtShortDate, seg, sumBy, toggle, ts, weekStart } from '../core/utils.js';
import { D, NOW, P, color, isCompleted, nameOf } from '../core/store.js';
import { avatar, chart, chartCard, chartOptions, clearChart, kpis, linesHtml, peopleBarChart } from '../core/ui.js';

const state = {
  days: 0,              // period filter, 0 = all time
  hideBots: true,
  metric: 'commits',    // bar chart metric: commits | merged | open | issues
  timeMetric: 'commits', // weekly chart: commits | merged | lines
  focus: new Set(),     // logins clicked on the cards (empty = everyone)
};

const html = `
  <div class="toolbar">
    <div class="seg" id="period">
      <button data-days="0" class="on">All time</button><button data-days="90">90 days</button>
      <button data-days="30">30 days</button><button data-days="14">14 days</button><button data-days="7">7 days</button>
    </div>
    <label class="check"><input type="checkbox" id="hideBots" checked> Hide bots</label>
  </div>
  <div class="kpis" id="kpis"></div>
  <div class="people" id="peopleCards"></div>
  <div class="grid2">
    <div class="card">
      <div class="card-head"><h3>Per contributor</h3>
        <div class="seg small" id="metric">
          <button data-m="commits" class="on">Commits</button><button data-m="merged">PRs merged</button>
          <button data-m="open">PRs open</button><button data-m="issues">Issues solved</button>
        </div>
      </div>
      <div class="chart-box"><canvas id="barChart"></canvas></div>
    </div>
    ${chartCard('Lines added / deleted', 'locChart', 'merge commits excluded')}
  </div>
  <div class="card">
    <div class="card-head"><h3>Activity over time</h3>
      <div class="seg small" id="timeMetric">
        <button data-m="commits" class="on">Commits / week</button><button data-m="merged">PRs merged / week</button>
        <button data-m="lines">Lines changed / week</button>
      </div>
    </div>
    <div class="chart-box tall"><canvas id="timeChart"></canvas></div>
  </div>`;

function setup() {
  seg('#period', 'days', (v) => { state.days = Number(v); render(); });
  seg('#metric', 'm', (v) => { state.metric = v; render(); });
  seg('#timeMetric', 'm', (v) => { state.timeMetric = v; render(); });
  $('#hideBots').addEventListener('change', (e) => { state.hideBots = e.target.checked; render(); });
}

const since = () => (state.days ? NOW - state.days * DAY : 0);

/**
 * Per-person totals for the period, sorted by commits.
 *  commits/add/del: commits on main (merges excluded by the fetch script) · merged: PRs merged, credited
 *  to the author · open: PRs open right now (ignores the period) · issues: issues closed as completed,
 *  credited to every assignee.
 */
function computeStats() {
  const from = since();
  const st = {};
  for (const p of Object.values(D.people)) {
    if (!(state.hideBots && p.bot)) st[p.login] = { login: p.login, commits: 0, add: 0, del: 0, merged: 0, open: 0, issues: 0 };
  }
  for (const c of D.commits) {
    if (c.t < from || !st[c.a]) continue;
    st[c.a].commits++;
    st[c.a].add += c.add;
    st[c.a].del += c.del;
  }
  for (const pr of D.prs) {
    if (!st[pr.a]) continue;
    if (pr.m && ts(pr.m) >= from) st[pr.a].merged++;
    if (pr.s === 'open') st[pr.a].open++;
  }
  for (const i of D.issues) {
    if (!isCompleted(i) || ts(i.cl) < from) continue;
    for (const a of i.as) if (st[a]) st[a].issues++;
  }
  return Object.values(st)
    .filter((s) => s.commits + s.merged + s.open + s.issues > 0)
    .sort((a, b) => b.commits - a.commits);
}

const sum = (stats, key) => sumBy(stats, (s) => s[key]);

function render() {
  const stats = computeStats();
  const period = state.days ? `last ${state.days} days` : 'all time';
  $('#kpis').innerHTML = kpis([
    ['Commits', fmtNum(sum(stats, 'commits')), period],
    ['PRs merged', fmtNum(sum(stats, 'merged')), period],
    ['PRs open', fmtNum(sum(stats, 'open')), 'right now'],
    ['Issues solved', fmtNum(sum(stats, 'issues')), period],
    ['Lines changed', linesHtml(sum(stats, 'add'), sum(stats, 'del')), period],
  ]);
  $('#peopleCards').innerHTML = stats.map(personCard).join('') || '<div class="empty">No activity in this period</div>';
  for (const el of $$('.person')) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // the "Profile" link navigates instead of focusing
      toggle(state.focus, el.dataset.login);
      render();
    });
  }

  const shown = stats.filter((s) => !state.focus.size || state.focus.has(s.login));
  peopleBarChart('barChart', shown.map((s) => [s.login, s[state.metric]]).sort((a, b) => b[1] - a[1]));
  renderLinesChart([...shown].sort((a, b) => b.add + b.del - (a.add + a.del)));
  renderWeeklyChart(shown.map((s) => s.login));
}

function personCard(s, rank) {
  const dim = state.focus.size && !state.focus.has(s.login) ? 'dim' : '';
  const stat = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
  const who = `<div><b>${nameOf(s.login)}</b><span class="muted small">@${esc(s.login)}</span></div>`;
  return `<div class="person ${dim}" style="--c:${color(s.login)}" data-login="${esc(s.login)}"
      title="Click to focus the charts on this person">
    <div class="who">${avatar(s.login)}${who}<span class="rank">#${rank + 1}</span></div>
    <div class="stats">${stat(s.commits, 'commits')}${stat(s.merged, 'merged')}${stat(s.open, 'open PRs')}${stat(s.issues, 'issues')}</div>
    <div class="loc">${linesHtml(s.add, s.del)}<a href="#person/${encodeURIComponent(s.login)}">Profile →</a></div>
  </div>`;
}

/** Diverging bars: lines added to the right, deleted to the left. */
function renderLinesChart(stats) {
  const bar = (label, data, backgroundColor) => ({ label, data, backgroundColor, borderRadius: 6, maxBarThickness: 30 });
  chart('locChart', {
    type: 'bar',
    data: {
      labels: stats.map((s) => P(s.login).name),
      datasets: [bar('Added', stats.map((s) => s.add), css('--ok')), bar('Deleted', stats.map((s) => -s.del), css('--bad'))],
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtNum(Math.abs(c.raw))}` } } },
      scales: { x: { stacked: true, ticks: { callback: (v) => fmtNum(Math.abs(v)) } }, y: { stacked: true, grid: { display: false } } },
    },
  });
}

/**
 * Weekly events of the chosen metric: [unix, login, up, down]. Commits and merged PRs count 1 each; for lines,
 * up = lines added and down = lines deleted by each commit (merge commits excluded by the fetch script).
 * Commits and lines are dated when they landed on main (their PR's merge), not when they were written, so
 * the work of a PR shows up in the week it was merged.
 */
function weeklyEvents(from) {
  if (state.timeMetric === 'merged') return D.prs.filter((p) => p.m && ts(p.m) >= from).map((p) => [ts(p.m), p.a, 1, 0]);
  const lines = state.timeMetric === 'lines';
  return D.commits.filter((c) => c.landed >= from).map((c) => [c.landed, c.a, lines ? c.add : 1, lines ? c.del : 0]);
}

/**
 * Stacked bars per week and per person: commits, merged PRs, or lines changed. Lines are diverging:
 * added above zero, deleted below zero (lighter shade of the person's color, one legend entry per person).
 */
function renderWeeklyChart(logins) {
  const events = weeklyEvents(since());
  if (!events.length) return clearChart('timeChart');

  const weeks = [];
  for (let w = weekStart(Math.min(...events.map(([t]) => t))); w <= weekStart(NOW); w = addWeeks(w, 1)) weeks.push(w);
  const index = new Map(weeks.map((w, i) => [w, i]));
  const zeros = () => Object.fromEntries(logins.map((l) => [l, weeks.map(() => 0)]));
  const up = zeros(), down = zeros();
  for (const [t, a, add, del] of events) {
    if (!up[a]) continue;
    up[a][index.get(weekStart(t))] += add;
    down[a][index.get(weekStart(t))] -= del;
  }

  const lines = state.timeMetric === 'lines';
  const bar = (l, data, backgroundColor) => ({ label: P(l).name, data, backgroundColor, borderRadius: 3 });
  const datasets = logins.map((l) => bar(l, up[l], color(l)));
  if (lines) datasets.push(...logins.map((l) => ({ ...bar(l, down[l], `${color(l)}80`), deleted: true })));

  // Tooltip: busiest people first, people with 0 hidden
  const tooltip = { itemSort: (a, b) => Math.abs(b.raw) - Math.abs(a.raw), filter: (item) => item.raw !== 0 };
  if (lines) tooltip.callbacks = { label: (c) => `${c.dataset.label}: ${c.raw > 0 ? '+' : '−'}${fmtNum(Math.abs(c.raw))}` };
  const options = chartOptions({ legend: true, stacked: true, tooltip });
  const dated = state.timeMetric === 'merged' ? '' : ', commits dated by their PR merge';
  options.scales.x.title = { display: true, text: `Week starting Friday 12:00${dated}` };
  if (lines) {
    options.scales.y.ticks.callback = (v) => fmtNum(Math.abs(v));
    options.plugins.legend.labels.filter = (item, data) => !data.datasets[item.datasetIndex].deleted;
    options.plugins.legend.onClick = togglePerson;
  }
  chart('timeChart', { type: 'bar', data: { labels: weeks.map(fmtShortDate), datasets }, options });
}

/** Legend click in lines mode: hides or shows both the added and the deleted bars of that person. */
function togglePerson(e, item, legend) {
  const ch = legend.chart;
  const show = !ch.isDatasetVisible(item.datasetIndex);
  ch.data.datasets.forEach((d, i) => d.label === item.text && ch.setDatasetVisibility(i, show));
  ch.update();
}

export default { id: 'contributors', label: 'Contributors', html, setup, render };
