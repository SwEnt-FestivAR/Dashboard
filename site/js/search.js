// Global search palette (Ctrl+K, Cmd+K or "/"): screens, people, open PRs and issues.
// Screens open in the Screens tab through the route "#screens/<key>"; the rest opens on GitHub.

import { $, $$, esc, norm } from './core/utils.js';
import { D, P, repoUrl } from './core/store.js';
import { avatar } from './core/ui.js';

const MAX_RESULTS = 12;

const HTML = `
  <dialog id="searchDialog" class="search">
    <input id="searchInput" type="search" placeholder="Search screens, people, PRs, issues…" autocomplete="off">
    <ul id="searchResults" class="search-results"></ul>
    <div class="muted small search-hint">↑ ↓ to move · Enter to open · Esc to close</div>
  </dialog>`;

let items = [];
let results = [];
let active = 0;

/** Every searchable thing: { kind, label, sub, text (normalized), icon (HTML), href }. */
function buildIndex() {
  const screens = D.units.map((u) => ({ kind: 'Screen', label: u.key, sub: u.feature, href: `#screens/${encodeURIComponent(u.key)}`, icon: '📱' }));
  const people = Object.values(D.people).filter((p) => !p.bot)
    .map((p) => ({ kind: 'Person', label: p.name, sub: `@${p.login}`, href: `https://github.com/${p.login}`, icon: avatar(p.login, 'xs') }));
  const prs = D.prs.map((p) => ({ kind: p.s === 'open' ? 'Open PR' : p.m ? 'Merged PR' : 'Closed PR', label: p.title, sub: `#${p.n} · ${P(p.a).name}`, href: repoUrl(`/pull/${p.n}`), icon: '⇄' }));
  const issues = D.issues.map((i) => ({ kind: i.s === 'open' ? 'Open issue' : 'Closed issue', label: i.title, sub: `#${i.n}`, href: repoUrl(`/issues/${i.n}`), icon: '◎' }));
  return [...screens, ...people, ...prs, ...issues].map((it) => ({ ...it, text: norm(`${it.label} ${it.sub}`) }));
}

/** Results for a query: every word must match. Order = index order (screens, people, then PRs/issues). */
function search(query) {
  const words = query.split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return items.filter((it) => it.kind === 'Screen').slice(0, MAX_RESULTS);
  return items.filter((it) => words.every((w) => it.text.includes(w))).slice(0, MAX_RESULTS);
}

function renderResults() {
  $('#searchResults').innerHTML = results.map((r, i) => `
    <li class="${i === active ? 'on' : ''}" data-i="${i}">
      <span class="search-icon">${r.icon}</span><span class="title">${esc(r.label)}</span>
      <span class="muted small">${esc(r.sub)}</span><span class="pill">${r.kind}</span>
    </li>`).join('') || '<li class="empty">No result</li>';
  $('#searchResults li.on')?.scrollIntoView({ block: 'nearest' });
  for (const li of $$('#searchResults li[data-i]')) li.addEventListener('click', () => go(results[li.dataset.i]));
}

function go(result) {
  if (!result) return;
  $('#searchDialog').close();
  if (result.href.startsWith('#')) location.hash = result.href;
  else window.open(result.href, '_blank', 'noopener');
}

function open() {
  if ($('#searchDialog').open) return;
  $('#searchInput').value = '';
  results = search('');
  active = 0;
  renderResults();
  $('#searchDialog').showModal();
}

/** Adds the palette, its keyboard shortcuts and the top-bar button. Call once, after the data is loaded. */
export function initSearch() {
  items = buildIndex();
  document.body.insertAdjacentHTML('beforeend', HTML);
  $('#searchBtn').addEventListener('click', open);
  $('#searchInput').addEventListener('input', (e) => { results = search(e.target.value); active = 0; renderResults(); });
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1);
      renderResults();
    } else if (e.key === 'Enter') {
      go(results[active]);
    }
  });
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      open();
    }
  });
}
