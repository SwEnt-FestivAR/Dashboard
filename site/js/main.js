// Entry point: loads the data, builds the nav and one section per tab, then routes on location.hash.
// Architecture overview: AGENTS.md. Tabs: js/tabs/index.js. data.json schema: scripts/fetch-data.mjs.

import { $, $$, esc } from './core/utils.js';
import { D, initStore, repoUrl } from './core/store.js';
import { TABS } from './tabs/index.js';

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Theme preference: <html data-theme="light|dark"> overrides the system setting; saved per browser. */
function initTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('theme');
    if (saved) root.dataset.theme = saved;
  } catch { /* storage blocked: follow the system theme */ }
  $('#themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* not persisted */ }
    showTab(); // charts read their colors from the theme
  });
}

function currentTab() {
  return TABS.find((t) => t.id === location.hash.slice(1)) || TABS[0];
}

/** Shows the section of the tab in the URL hash and renders it. */
function showTab() {
  const tab = currentTab();
  for (const s of $$('.tab')) s.hidden = s.id !== `tab-${tab.id}`;
  for (const a of $$('#tabs a')) a.classList.toggle('on', a.dataset.tab === tab.id);
  tab.render();
}

async function boot() {
  initTheme();
  let data, status = {};
  try {
    data = await loadJson('data.json');
  } catch {
    $('#loading').textContent = 'Could not load data.json. Run scripts/fetch-data.mjs first.';
    return;
  }
  try { status = await loadJson('status.json'); } catch { /* no manual statuses yet */ }
  initStore(data, status);

  $('#repoLink').textContent = D.repo;
  $('#repoLink').href = repoUrl();
  $('#updated').textContent = `Updated ${new Date(D.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
  $('#tabs').innerHTML = TABS.map((t) => `<a href="#${t.id}" data-tab="${t.id}">${esc(t.label)}</a>`).join('');
  $('#main').innerHTML = TABS.map((t) => `<section id="tab-${t.id}" class="tab" hidden>${t.html}</section>`).join('');

  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  for (const t of TABS) t.setup();
  window.addEventListener('hashchange', () => { scrollTo(0, 0); showTab(); });
  showTab();
}

boot();
