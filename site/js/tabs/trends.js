// Trends tab: curves over the semester from history.json, the daily snapshots that the workflow keeps on
// the `data` branch (see scripts/snapshot.mjs). The file is loaded the first time the tab is shown.

import { $, css, fmtDate, fmtShortDate, ts } from '../core/utils.js';
import { chart, kpis } from '../core/ui.js';
import { STATUSES } from '../screens/units.js';

let history = null; // null = not loaded yet, [] = missing or empty

const html = `
  <div class="card notice" id="trendsNotice" hidden></div>
  <div class="kpis" id="trendsKpis"></div>
  <div class="card"><div class="card-head"><h3>Open PRs and issues</h3><span class="muted small">one point per day</span></div>
    <div class="chart-box tall"><canvas id="flowChart"></canvas></div></div>
  <div class="card"><div class="card-head"><h3>Screens per status</h3></div>
    <div class="chart-box tall"><canvas id="screensChart"></canvas></div></div>`;

async function load() {
  try {
    const res = await fetch('history.json', { cache: 'no-cache' });
    history = res.ok ? await res.json() : [];
  } catch {
    history = []; // no history published yet
  }
}

/** "+3" / "−2" / "±0" between the first and the last snapshot. */
const delta = (key, pick = (h) => h[key]) => {
  const n = pick(history.at(-1)) - pick(history[0]);
  if (n > 0) return `+${n}`;
  return n < 0 ? `−${-n}` : '±0';
};

async function render() {
  if (!history) await load();
  const notice = $('#trendsNotice');
  notice.hidden = history.length >= 2;
  notice.textContent = history.length
    ? `History started on ${fmtDate(ts(history[0].d))}: the curves fill in with one snapshot per daily run.`
    : 'No history yet: the deployed workflow saves one snapshot per day on the data branch.';
  if (!history.length) return;

  const since = `since ${fmtDate(ts(history[0].d))}`;
  const done = (h) => h.screens.finalized || 0;
  $('#trendsKpis').innerHTML = kpis([
    ['Open PRs', history.at(-1).prsOpen, `${delta('prsOpen')} ${since}`],
    ['Open issues', history.at(-1).issuesOpen, `${delta('issuesOpen')} ${since}`],
    ['Issues closed', history.at(-1).issuesClosed, `${delta('issuesClosed')} ${since}`],
    ['Screens finalized', done(history.at(-1)), `${delta(null, done)} ${since}`],
  ]);

  const labels = history.map((h) => fmtShortDate(ts(h.d)));
  const line = (label, key, color, dashed) => ({ label, data: history.map((h) => h[key]), borderColor: color, backgroundColor: color, borderDash: dashed ? [5, 4] : [], tension: 0.3, pointRadius: 2 });
  chart('flowChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        line('Open PRs', 'prsOpen', '#6d4aff'), line('Draft PRs', 'prsDraft', '#6d4aff', true),
        line('Open issues', 'issuesOpen', '#f59e0b'), line('Unassigned issues', 'issuesUnassigned', '#f59e0b', true),
      ],
    },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
  });
  chart('screensChart', {
    type: 'line',
    data: {
      labels,
      datasets: STATUSES.map((s) => ({ label: s.label, data: history.map((h) => h.screens[s.id] || 0), backgroundColor: css(s.css), borderColor: css(s.css), fill: true, tension: 0.3, pointRadius: 0 })),
    },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
  });
}

export default { id: 'trends', label: 'Trends', html, setup() {}, render };
