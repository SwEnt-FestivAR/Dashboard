// Reusable HTML pieces and chart helpers shared by several tabs.
// Each function returns an HTML string (or draws a chart); callers insert it with innerHTML.

import { $, css, esc, ts } from './utils.js';
import { P, ago, color, nameOf, repoUrl } from './store.js';

/** Round avatar. `hint` is prepended to the tooltip, e.g. "12 commits · ". Sizes: '' (34px), 'sm', 'xs'. */
export function avatar(login, size = '', hint = '') {
  const p = P(login);
  return `<img class="avatar ${size}" src="${esc(p.avatar)}" alt="" title="${esc(hint)}${esc(p.name)} (@${esc(login)})" loading="lazy">`;
}

/** Overlapping avatars of several logins. */
export const avatars = (logins, size = 'xs') => `<span class="avatars">${logins.map((l) => avatar(l, size)).join('')}</span>`;

/** Link opening in a new tab. `label` must already be safe HTML. */
export const extLink = (href, label, cls = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;

/** Row of KPI tiles. items: [[label, value, subtitle?]]; value may contain HTML. */
export function kpis(items) {
  return items.map(([label, value, sub]) =>
    `<div class="kpi"><div class="l">${label}</div><div class="v">${value}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`).join('');
}

/** One <li> of an .issue-list: number, title, labels, assignees, age. */
export function issueRow(i) {
  const labels = i.labels.map((l) => `<span class="label" style="color:#${esc(l.color)};border-color:#${esc(l.color)}">${esc(l.name)}</span>`).join('');
  const when = i.s === 'closed' ? `closed ${ago(ts(i.cl))}` : `opened ${ago(ts(i.c))}`;
  return `<li><span class="num">#${i.n}</span>${extLink(repoUrl(`/issues/${i.n}`), esc(i.title), 'title')}
    ${labels}${avatars(i.as, 'sm')}<span class="muted small">${when}</span></li>`;
}

/** Appends <option>s for logins to a <select> that already has its "All …" option. */
export function fillPeopleSelect(sel, logins) {
  $(sel).insertAdjacentHTML('beforeend', logins.map((l) => `<option value="${esc(l)}">${nameOf(l)}</option>`).join(''));
}

const charts = {};

/**
 * Creates or recreates a Chart.js chart on <canvas id>. Always use this instead of `new Chart`: it destroys
 * the previous chart on that canvas and applies the current theme's grid and text colors.
 */
export function chart(id, config) {
  charts[id]?.destroy();
  Chart.defaults.color = css('--muted');
  for (const axis of Object.values(config.options?.scales || {})) {
    axis.grid = { color: css('--border'), ...axis.grid };
    axis.border = { display: false };
  }
  charts[id] = new Chart(document.getElementById(id), config);
}

/** Removes the chart on a canvas (e.g. when there is nothing to show). */
export function clearChart(id) {
  charts[id]?.destroy();
  delete charts[id];
}

/** Horizontal bar chart with one bar per person, colored with their color. rows: [[login, value]]. */
export function peopleBarChart(id, rows) {
  chart(id, {
    type: 'bar',
    data: {
      labels: rows.map(([l]) => P(l).name),
      datasets: [{ data: rows.map(([, v]) => v), backgroundColor: rows.map(([l]) => color(l)), borderRadius: 6, maxBarThickness: 32 }],
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } },
    },
  });
}
