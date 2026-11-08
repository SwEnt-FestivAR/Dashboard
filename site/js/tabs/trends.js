// Trends tab: curves over the semester from history.json, the daily snapshots that the workflow keeps on
// the `data` branch (see scripts/snapshot.mjs). The file is loaded the first time the tab is shown.

import { $, css, fmtDate, fmtShortDate, ts } from '../core/utils.js';
import { chart, chartCard, chartOptions, kpis } from '../core/ui.js';
import { STATUSES } from '../screens/units.js';

let history = null; // null = not loaded yet, [] = missing or empty

const html = `
  <div class="card notice" id="trendsNotice" hidden></div>
  <div class="kpis" id="trendsKpis"></div>
  ${chartCard('Open PRs and issues', 'flowChart', 'one point per day', true)}
  ${chartCard('Screens per status', 'screensChart', '', true)}`;

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
  const line = (label, values, color, dashed = false) => ({
    label, data: values, borderColor: color, backgroundColor: color, borderDash: dashed ? [5, 4] : [], tension: 0.3, pointRadius: 2,
  });
  const series = (key) => history.map((h) => h[key]);
  chart('flowChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        line('Open PRs', series('prsOpen'), css('--accent')),
        line('Draft PRs', series('prsDraft'), css('--accent'), true),
        line('Open issues', series('issuesOpen'), css('--warn')),
        line('Unassigned issues', series('issuesUnassigned'), css('--warn'), true),
      ],
    },
    options: chartOptions({ legend: true }),
  });
  chart('screensChart', {
    type: 'line',
    data: {
      labels,
      datasets: STATUSES.map((s) => ({
        ...line(s.label, history.map((h) => h.screens[s.id] || 0), css(s.css)), fill: true, pointRadius: 0,
      })),
    },
    options: chartOptions({ legend: true, stacked: true }),
  });
}

export default { id: 'trends', label: 'Trends', html, setup() {}, render };
