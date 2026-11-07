// Contributors tab: KPIs, one card per person, and charts, filtered by period.

import { $, $$, DAY, esc, fmtNum, seg, toggle, ts, weekStart } from '../core/utils.js';
import { D, NOW, P, color, nameOf } from '../core/store.js';
import { avatar, chart, clearChart, kpis, peopleBarChart } from '../core/ui.js';

const state = {
  days: 0,              // period filter, 0 = all time
  hideBots: true,
  metric: 'commits',    // bar chart metric: commits | merged | open | issues
  timeMetric: 'commits', // weekly chart: commits | merged
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
    <div class="card">
      <div class="card-head"><h3>Lines added / deleted</h3><span class="muted small">merge commits excluded</span></div>
      <div class="chart-box"><canvas id="locChart"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Activity over time</h3>
      <div class="seg small" id="timeMetric">
        <button data-m="commits" class="on">Commits / week</button><button data-m="merged">PRs merged / week</button>
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
    if (i.s !== 'closed' || i.r === 'not_planned' || ts(i.cl) < from) continue;
    for (const a of i.as) if (st[a]) st[a].issues++;
  }
  return Object.values(st)
    .filter((s) => s.commits + s.merged + s.open + s.issues > 0)
    .sort((a, b) => b.commits - a.commits);
}

const sum = (stats, key) => stats.reduce((t, s) => t + s[key], 0);
const lines = (add, del) => `<span class="plus">+${fmtNum(add)}</span> <span class="minus">−${fmtNum(del)}</span>`;

function render() {
  const stats = computeStats();
  const period = state.days ? `last ${state.days} days` : 'all time';
  $('#kpis').innerHTML = kpis([
    ['Commits', fmtNum(sum(stats, 'commits')), period],
    ['PRs merged', fmtNum(sum(stats, 'merged')), period],
    ['PRs open', fmtNum(sum(stats, 'open')), 'right now'],
    ['Issues solved', fmtNum(sum(stats, 'issues')), period],
    ['Lines changed', lines(sum(stats, 'add'), sum(stats, 'del')), period],
  ]);
  $('#peopleCards').innerHTML = stats.map(personCard).join('') || '<div class="empty">No activity in this period</div>';
  for (const el of $$('.person')) el.addEventListener('click', () => { toggle(state.focus, el.dataset.login); render(); });

  const shown = stats.filter((s) => !state.focus.size || state.focus.has(s.login));
  peopleBarChart('barChart', shown.map((s) => [s.login, s[state.metric]]).sort((a, b) => b[1] - a[1]));
  renderLinesChart([...shown].sort((a, b) => b.add + b.del - (a.add + a.del)));
  renderWeeklyChart(shown.map((s) => s.login));
}

function personCard(s, rank) {
  const dim = state.focus.size && !state.focus.has(s.login) ? 'dim' : '';
  const stat = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
  return `<div class="person ${dim}" style="--c:${color(s.login)}" data-login="${esc(s.login)}" title="Click to focus the charts on this person">
    <div class="who">${avatar(s.login)}<div><b>${nameOf(s.login)}</b><span class="muted small">@${esc(s.login)}</span></div><span class="rank">#${rank + 1}</span></div>
    <div class="stats">${stat(s.commits, 'commits')}${stat(s.merged, 'merged')}${stat(s.open, 'open PRs')}${stat(s.issues, 'issues')}</div>
    <div class="loc">${lines(s.add, s.del)}</div>
  </div>`;
}

/** Diverging bars: lines added to the right, deleted to the left. */
function renderLinesChart(stats) {
  const bar = (label, data, backgroundColor) => ({ label, data, backgroundColor, borderRadius: 6, maxBarThickness: 30 });
  chart('locChart', {
    type: 'bar',
    data: {
      labels: stats.map((s) => P(s.login).name),
      datasets: [bar('Added', stats.map((s) => s.add), '#10b981'), bar('Deleted', stats.map((s) => -s.del), '#f43f5e')],
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtNum(Math.abs(c.raw))}` } } },
      scales: { x: { stacked: true, ticks: { callback: (v) => fmtNum(Math.abs(v)) } }, y: { stacked: true, grid: { display: false } } },
    },
  });
}

/** Stacked bars of commits (or merged PRs) per week and per person. */
function renderWeeklyChart(logins) {
  const from = since();
  const events = state.timeMetric === 'commits'
    ? D.commits.filter((c) => c.t >= from).map((c) => [c.t, c.a])
    : D.prs.filter((p) => p.m && ts(p.m) >= from).map((p) => [ts(p.m), p.a]);
  if (!events.length) return clearChart('timeChart');

  const weeks = [];
  for (let w = weekStart(Math.min(...events.map(([t]) => t))); w <= weekStart(NOW); w += 7 * DAY) weeks.push(w);
  const index = new Map(weeks.map((w, i) => [w, i]));
  const series = Object.fromEntries(logins.map((l) => [l, weeks.map(() => 0)]));
  for (const [t, a] of events) if (series[a]) series[a][index.get(weekStart(t))]++;

  chart('timeChart', {
    type: 'bar',
    data: {
      labels: weeks.map((w) => new Date(w * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      datasets: logins.map((l) => ({ label: P(l).name, data: series[l], backgroundColor: color(l), borderRadius: 3 })),
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { itemSort: (a, b) => b.raw - a.raw, filter: (item) => item.raw > 0 },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, title: { display: true, text: 'Week of' } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

export default { id: 'contributors', label: 'Contributors', html, setup, render };
