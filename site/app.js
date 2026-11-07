'use strict';
// FestivAR dashboard: renders data.json (built by scripts/fetch-data.mjs) and status.json.

const PALETTE = ['#6d4aff', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#84cc16', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const STATUSES = [
  { id: 'in-dev', label: 'In development', css: '--s-indev', desc: 'Only exists in an open PR' },
  { id: 'developed', label: 'Developed', css: '--s-developed', desc: 'Merged on main' },
  { id: 'tested', label: 'Tested', css: '--s-tested', desc: 'Merged, with UI tests (and ViewModel unit tests)' },
  { id: 'finalized', label: 'Finalized', css: '--s-finalized', desc: 'Done, only small fixes expected' },
  { id: 'frozen', label: 'Frozen', css: '--s-frozen', desc: 'Finalized and must not be touched anymore' },
];
const DAY = 86400;

let D, STATUS = { screens: {} }, NOW;
const S = { days: 0, hideBots: true, metric: 'commits', timeMetric: 'commits', focus: new Set(), ms: null, msState: 'open' };
const charts = {};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const ts = (iso) => (iso ? Date.parse(iso) / 1000 : null);
const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtNum = (n) => n.toLocaleString('en-US');
function ago(t) {
  if (!t) return '—';
  const d = (NOW - t) / DAY;
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
const P = (login) => D.people[login] || { login, name: login || 'unknown', avatar: '', bot: false };
const color = (login) => P(login).color || '#64748b';
const avatar = (login, cls = '') => `<img class="avatar ${cls}" src="${esc(P(login).avatar)}" alt="" title="${esc(P(login).name)} (@${esc(login)})" loading="lazy">`;
const humans = () => Object.values(D.people).filter((p) => !(S.hideBots && p.bot));
const repoUrl = (p = '') => `https://github.com/${D.repo}${p}`;

// ---------------------------------------------------------------- boot
(async function boot() {
  try { if (localStorage.getItem('theme')) document.documentElement.dataset.theme = localStorage.getItem('theme'); } catch {}
  try {
    D = await (await fetch('data.json', { cache: 'no-cache' })).json();
  } catch (e) {
    $('#loading').textContent = 'Could not load data.json. Run scripts/fetch-data.mjs first.';
    return;
  }
  try { STATUS = await (await fetch('status.json', { cache: 'no-cache' })).json(); STATUS.screens ||= {}; } catch {}
  NOW = ts(D.generatedAt);
  Object.values(D.people).sort((a, b) => a.login.localeCompare(b.login)).forEach((p, i) => (p.color = PALETTE[i % PALETTE.length]));
  D.commits = D.commits.map(([t, a, add, del]) => ({ t, a, add, del }));

  $('#repoLink').textContent = D.repo;
  $('#repoLink').href = repoUrl();
  $('#updated').textContent = `Updated ${new Date(D.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
  $('#loading').remove();

  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  setupControls();
  window.addEventListener('hashchange', () => { scrollTo(0, 0); showTab(); });
  showTab();
})();

function showTab() {
  const tab = (location.hash.slice(1) || 'contributors');
  const valid = ['contributors', 'screens', 'prs', 'milestones'].includes(tab) ? tab : 'contributors';
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${valid}`));
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === valid));
  ({ contributors: renderContributors, screens: renderScreens, prs: renderPRs, milestones: renderMilestones })[valid]();
}

function seg(sel, key, cb) {
  document.querySelectorAll(`${sel} button`).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b));
    cb(b.dataset[key]);
  }));
}

function setupControls() {
  $('#themeBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch {}
    showTab();
  };
  seg('#period', 'days', (v) => { S.days = +v; renderContributors(); });
  seg('#metric', 'm', (v) => { S.metric = v; renderContributors(); });
  seg('#timeMetric', 'm', (v) => { S.timeMetric = v; renderContributors(); });
  $('#hideBots').onchange = (e) => { S.hideBots = e.target.checked; renderContributors(); };
  ['#screenSearch', '#screenAuthor', '#screenStatus'].forEach((s) => $(s).addEventListener('input', renderScreens));
  ['#prAuthor', '#staleOnly'].forEach((s) => $(s).addEventListener('input', renderPRs));
  seg('#msIssueState', 's', (v) => { S.msState = v; renderMilestoneIssues(); });

  for (const st of STATUSES) $('#screenStatus').insertAdjacentHTML('beforeend', `<option value="${st.id}">${st.label}</option>`);
  const authors = [...new Set(D.units.flatMap((u) => [u.screen?.author, u.viewModel?.author]).filter(Boolean))].sort();
  for (const a of authors) $('#screenAuthor').insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(P(a).name)}</option>`);
  const prAuthors = [...new Set(D.openPRs.map((p) => p.a))].sort();
  for (const a of prAuthors) $('#prAuthor').insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(P(a).name)}</option>`);
  const features = [...new Set(D.units.map((u) => u.feature))];
  $('#featureFilter').innerHTML = ['all', ...features].map((f, i) => `<button data-f="${f}" class="${i ? '' : 'on'}">${f === 'all' ? 'All features' : f}</button>`).join('');
  S.feature = 'all';
  seg('#featureFilter', 'f', (v) => { S.feature = v; renderScreens(); });
  setupDialog();
}

function chart(id, config) {
  charts[id]?.destroy();
  const grid = css('--border'), text = css('--muted');
  Chart.defaults.color = text;
  for (const ax of Object.values(config.options?.scales || {})) {
    ax.grid = { color: grid, ...(ax.grid || {}) };
    ax.border = { display: false };
  }
  charts[id] = new Chart(document.getElementById(id), config);
}

// ---------------------------------------------------------------- contributors
function computeStats() {
  const since = S.days ? NOW - S.days * DAY : 0;
  const st = {};
  for (const p of humans()) st[p.login] = { login: p.login, commits: 0, add: 0, del: 0, merged: 0, open: 0, issues: 0 };
  for (const c of D.commits) if (c.t >= since && st[c.a]) { st[c.a].commits++; st[c.a].add += c.add; st[c.a].del += c.del; }
  for (const pr of D.prs) {
    if (!st[pr.a]) continue;
    if (pr.m && ts(pr.m) >= since) st[pr.a].merged++;
    if (pr.s === 'open') st[pr.a].open++;
  }
  for (const i of D.issues) {
    if (i.s !== 'closed' || i.r === 'not_planned' || ts(i.cl) < since) continue;
    for (const a of i.as) if (st[a]) st[a].issues++;
  }
  return Object.values(st).filter((s) => s.commits + s.merged + s.open + s.issues > 0).sort((a, b) => b.commits - a.commits);
}

function renderContributors() {
  const stats = computeStats();
  const tot = stats.reduce((t, s) => { for (const k of ['commits', 'merged', 'open', 'issues', 'add', 'del']) t[k] += s[k]; return t; }, { commits: 0, merged: 0, open: 0, issues: 0, add: 0, del: 0 });
  const periodLabel = S.days ? `last ${S.days} days` : 'all time';
  $('#kpis').innerHTML = [
    ['Commits', fmtNum(tot.commits), periodLabel],
    ['PRs merged', fmtNum(tot.merged), periodLabel],
    ['PRs open', fmtNum(tot.open), 'right now'],
    ['Issues solved', fmtNum(tot.issues), periodLabel],
    ['Lines changed', `<span class="plus">+${fmtNum(tot.add)}</span> <span class="minus small">−${fmtNum(tot.del)}</span>`, periodLabel],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="muted small">${s}</div></div>`).join('');

  $('#peopleCards').innerHTML = stats.map((s, i) => `
    <div class="person ${S.focus.size && !S.focus.has(s.login) ? 'dim' : ''}" style="--c:${color(s.login)}" data-login="${esc(s.login)}" title="Click to focus the charts on this person">
      <div class="who">${avatar(s.login)}<div><b>${esc(P(s.login).name)}</b><span class="muted small">@${esc(s.login)}</span></div><span class="rank">#${i + 1}</span></div>
      <div class="stats">
        <div><b>${s.commits}</b><span>commits</span></div><div><b>${s.merged}</b><span>merged</span></div>
        <div><b>${s.open}</b><span>open PRs</span></div><div><b>${s.issues}</b><span>issues</span></div>
      </div>
      <div class="loc"><span class="plus">+${fmtNum(s.add)}</span><span class="minus">−${fmtNum(s.del)}</span></div>
    </div>`).join('') || '<div class="empty">No activity in this period</div>';
  document.querySelectorAll('.person').forEach((el) => el.onclick = () => {
    const l = el.dataset.login;
    S.focus.has(l) ? S.focus.delete(l) : S.focus.add(l);
    renderContributors();
  });

  const shown = stats.filter((s) => !S.focus.size || S.focus.has(s.login));
  const sorted = [...shown].sort((a, b) => b[S.metric] - a[S.metric]);
  chart('barChart', {
    type: 'bar',
    data: { labels: sorted.map((s) => P(s.login).name), datasets: [{ data: sorted.map((s) => s[S.metric]), backgroundColor: sorted.map((s) => color(s.login)), borderRadius: 6, maxBarThickness: 34 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
  });

  const byLoc = [...shown].sort((a, b) => b.add + b.del - (a.add + a.del));
  chart('locChart', {
    type: 'bar',
    data: {
      labels: byLoc.map((s) => P(s.login).name),
      datasets: [
        { label: 'Added', data: byLoc.map((s) => s.add), backgroundColor: '#10b981', borderRadius: 6, maxBarThickness: 30 },
        { label: 'Deleted', data: byLoc.map((s) => -s.del), backgroundColor: '#f43f5e', borderRadius: 6, maxBarThickness: 30 },
      ],
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtNum(Math.abs(c.raw))}` } } },
      scales: { x: { stacked: true, ticks: { callback: (v) => fmtNum(Math.abs(v)) } }, y: { stacked: true, grid: { display: false } } },
    },
  });

  renderTimeChart(shown.map((s) => s.login));
}

function weekStart(t) {
  const d = new Date(t * 1000); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime() / 1000;
}
function renderTimeChart(logins) {
  const since = S.days ? NOW - S.days * DAY : 0;
  const events = S.timeMetric === 'commits'
    ? D.commits.filter((c) => c.t >= since).map((c) => [c.t, c.a])
    : D.prs.filter((p) => p.m && ts(p.m) >= since).map((p) => [ts(p.m), p.a]);
  if (!events.length) { charts.timeChart?.destroy(); return; }
  const first = weekStart(Math.min(...events.map((e) => e[0]))), last = weekStart(NOW);
  const weeks = [];
  for (let w = first; w <= last; w += 7 * DAY) weeks.push(w);
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const series = Object.fromEntries(logins.map((l) => [l, new Array(weeks.length).fill(0)]));
  for (const [t, a] of events) if (series[a]) series[a][idx.get(weekStart(t))]++;
  chart('timeChart', {
    type: 'bar',
    data: {
      labels: weeks.map((w) => new Date(w * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      datasets: logins.map((l) => ({ label: P(l).name, data: series[l], backgroundColor: color(l), borderRadius: 3 })),
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { itemSort: (a, b) => b.raw - a.raw, filter: (i) => i.raw > 0 } },
      scales: { x: { stacked: true, grid: { display: false }, title: { display: true, text: 'Week of' } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// ---------------------------------------------------------------- screens
const unitId = (u) => `${u.feature}/${u.key}`;
const onMain = (f) => f && !f.inPR;
function autoStatus(u) {
  if (!onMain(u.screen) && !onMain(u.viewModel)) return 'in-dev';
  if (u.tests.ui.length && (!onMain(u.viewModel) || u.tests.unit.length)) return 'tested';
  return 'developed';
}
function unitStatus(u) {
  const manual = STATUS.screens[unitId(u)];
  const status = STATUSES.some((s) => s.id === manual?.status) ? manual.status : autoStatus(u);
  const lastMod = Math.max(u.screen?.lastModified || 0, u.viewModel?.lastModified || 0);
  const frozenSince = manual?.since ? ts(manual.since) : 0;
  const frozenBroken = status === 'frozen' && (u.openPRs.length > 0 || (frozenSince && lastMod > frozenSince + DAY));
  return { status, manual: !!manual?.status, note: manual?.note, frozenBroken };
}
const stInfo = (id) => STATUSES.find((s) => s.id === id);
const stColor = (id) => css(stInfo(id).css);

function statusBar(units) {
  return STATUSES.map((s) => {
    const n = units.filter((u) => unitStatus(u).status === s.id).length;
    return n ? `<div style="width:${(100 * n) / units.length}%;background:var(${s.css})" title="${s.label}: ${n}"></div>` : '';
  }).join('');
}

function renderScreens() {
  const all = D.units;
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, all.filter((u) => unitStatus(u).status === s.id).length]));
  const done = counts.finalized + counts.frozen;
  $('#statusSummary').innerHTML = `
    <div class="card-head" style="margin:0"><h3>${all.length} screens · ${Math.round((100 * done) / all.length)}% finalized</h3>
      <span class="muted small">Auto status from code &amp; PRs, overridden by <a href="${esc(statusFileUrl())}" target="_blank" rel="noopener">status.json</a>. Click a badge to change it.</span></div>
    <div class="bar">${statusBar(all)}</div>
    <div class="legend">${STATUSES.map((s) => `<span title="${esc(s.desc)}"><i class="dot" style="background:var(${s.css})"></i>${s.label} <b>${counts[s.id]}</b></span>`).join('')}</div>`;

  const q = $('#screenSearch').value.toLowerCase(), au = $('#screenAuthor').value, stf = $('#screenStatus').value;
  const filtered = all.filter((u) =>
    (S.feature === 'all' || u.feature === S.feature) &&
    (!q || `${u.key} ${u.feature} ${u.screen?.path || ''} ${u.viewModel?.path || ''}`.toLowerCase().includes(q)) &&
    (!au || u.screen?.author === au || u.viewModel?.author === au) &&
    (!stf || unitStatus(u).status === stf));

  const features = [...new Set(filtered.map((u) => u.feature))];
  $('#features').innerHTML = features.map((f) => {
    const us = filtered.filter((u) => u.feature === f);
    const featAll = all.filter((u) => u.feature === f);
    const contrib = {};
    for (const u of featAll) for (const file of [u.screen, u.viewModel]) for (const c of file?.contributors || []) contrib[c.login] = (contrib[c.login] || 0) + c.n;
    const top = Object.entries(contrib).sort((a, b) => b[1] - a[1]);
    return `<div class="feature">
      <div class="feature-head"><h2>${esc(f)}</h2><span class="pill">${featAll.length} screen${featAll.length > 1 ? 's' : ''}</span>
        <div class="mini">${statusBar(featAll)}</div>
        <span class="muted small">Contributors</span><span class="avatars">${top.map(([l, n]) => avatar(l, 'sm').replace('title="', `title="${n} commits · `)).join('')}</span>
        ${top.length <= 1 ? '<span class="pill warn" title="Only one person ever touched this feature">bus factor 1</span>' : ''}
      </div>
      <div class="units">${us.map(renderUnit).join('')}</div></div>`;
  }).join('') || '<div class="empty">No screen matches these filters</div>';
  document.querySelectorAll('.status-btn').forEach((b) => (b.onclick = () => openDialog(b.dataset.id)));
}

function renderUnit(u) {
  const st = unitStatus(u);
  const info = stInfo(st.status);
  const tests = [
    u.tests.ui.length ? `<span class="pill ok" title="${esc(u.tests.ui.join(', '))}">✓ ${u.tests.ui.length} UI test file${u.tests.ui.length > 1 ? 's' : ''}</span>` : '<span class="pill bad">✗ no UI test</span>',
    u.tests.unit.length ? `<span class="pill ok" title="${esc(u.tests.unit.join(', '))}">✓ ${u.tests.unit.length} unit test file${u.tests.unit.length > 1 ? 's' : ''}</span>` : '<span class="pill bad">✗ no unit test</span>',
  ];
  const prs = u.openPRs.map((n) => {
    const pr = D.openPRs.find((p) => p.n === n);
    return `<a class="pill info" href="${repoUrl(`/pull/${n}`)}" target="_blank" rel="noopener" title="${esc(pr?.title)} — ${esc(P(pr?.a).name)}">PR #${n}</a>`;
  });
  return `<div class="unit" style="--sc:var(${info.css})">
    <div class="unit-head"><h4>${esc(u.key)}</h4>
      ${st.frozenBroken ? '<span class="pill bad" title="Frozen but modified after the freeze date or touched by an open PR">⚠ touched while frozen</span>' : ''}
      <button class="status-btn" data-id="${esc(unitId(u))}" title="${esc(info.desc)} — click to change">${info.label} <small>${st.manual ? '· manual' : '· auto'}</small></button>
    </div>
    <div class="blocks">${renderBlock(u.screen, 'Screen')}${renderBlock(u.viewModel, 'ViewModel')}</div>
    <div class="unit-foot">${tests.join('')}${prs.join('')}${st.note ? `<div class="note">📝 ${esc(st.note)}</div>` : ''}</div>
  </div>`;
}

function renderBlock(f, kind) {
  if (!f) return `<div class="block missing">No ${kind}</div>`;
  const others = (f.contributors || []).filter((c) => c.login !== f.author);
  const href = f.inPR ? repoUrl(`/pull/${f.inPR}/files`) : repoUrl(`/blob/${D.branch}/${f.path}`);
  return `<div class="block">
    <div class="kind"><span>${kind}</span>${f.inPR ? `<span class="pill warn">only in PR #${f.inPR}</span>` : ''}</div>
    <div class="fname"><a href="${href}" target="_blank" rel="noopener">${esc(f.path.split('/').pop())}</a></div>
    <div class="author">${avatar(f.author)}<div><span class="muted small">Initial author</span><b>${esc(P(f.author).name)}</b></div></div>
    <div class="meta">
      Created ${fmtDate(f.created)}<br>
      ${f.inPR ? `~${f.lines} lines added` : `${f.lines} lines · ${f.commits} commit${f.commits > 1 ? 's' : ''}${f.todos ? ` · <span class="minus">${f.todos} TODO</span>` : ''}<br>
      Last change ${ago(f.lastModified)} by ${esc(P(f.lastAuthor).name)}`}
      ${others.length ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">Also: <span class="avatars">${others.map((c) => avatar(c.login, 'xs').replace('title="', `title="${c.n} commits · `)).join('')}</span></div>` : ''}
    </div></div>`;
}

// ---------------------------------------------------------------- status dialog
const statusFileUrl = (mode = 'blob') => `https://github.com/${D.siteRepo}/${mode}/main/status.json`;
let dlg = { id: null, status: null };
function setupDialog() {
  $('#dlgStatuses').innerHTML = STATUSES.map((s) => `<button type="button" data-s="${s.id}">${s.label}</button>`).join('');
  seg('#dlgStatuses', 's', (v) => { dlg.status = v; updateDlgJson(); });
  $('#dlgNote').oninput = updateDlgJson;
  $('#dlgCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#dlgJson').textContent); $('#dlgCopy').textContent = 'Copied ✓'; } catch { $('#dlgCopy').textContent = 'Select & copy manually'; }
    setTimeout(() => ($('#dlgCopy').textContent = 'Copy entry'), 1500);
  };
  $('#dlgEdit').href = statusFileUrl('edit');
}
function openDialog(id) {
  const u = D.units.find((x) => unitId(x) === id);
  const st = unitStatus(u);
  dlg = { id, status: st.status };
  $('#dlgName').textContent = u.key;
  $('#dlgNote').value = st.note || '';
  document.querySelectorAll('#dlgStatuses button').forEach((b) => b.classList.toggle('on', b.dataset.s === dlg.status));
  updateDlgJson();
  $('#statusDialog').showModal();
}
function updateDlgJson() {
  const entry = { status: dlg.status, since: new Date().toISOString().slice(0, 10) };
  if ($('#dlgNote').value.trim()) entry.note = $('#dlgNote').value.trim();
  $('#dlgJson').textContent = `"${dlg.id}": ${JSON.stringify(entry)},`;
}

// ---------------------------------------------------------------- open PRs
function renderPRs() {
  const au = $('#prAuthor').value, staleOnly = $('#staleOnly').checked;
  const isStale = (p) => NOW - ts(p.u) > 3 * DAY;
  const prs = D.openPRs.filter((p) => (!au || p.a === au) && (!staleOnly || isStale(p)));
  const all = D.openPRs;
  const avgAge = all.length ? all.reduce((t, p) => t + (NOW - ts(p.c)), 0) / all.length / DAY : 0;
  $('#prKpis').innerHTML = [
    ['Open PRs', all.length], ['Drafts', all.filter((p) => p.d).length],
    ['Ready for review', all.filter((p) => !p.d).length], ['Stale (> 3 days)', all.filter(isStale).length],
    ['Average age', `${avgAge.toFixed(1)} d`],
  ].map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');

  const cols = D.hasToken
    ? [['Draft', (p) => p.d], ['Needs review', (p) => !p.d && !['approved', 'changes'].includes(p.review)], ['Changes requested', (p) => !p.d && p.review === 'changes'], ['Approved', (p) => !p.d && p.review === 'approved']]
    : [['Draft', (p) => p.d], ['Ready for review', (p) => !p.d]];
  $('#kanban').style.gridTemplateColumns = `repeat(${cols.length}, minmax(240px, 1fr))`;
  $('#kanban').innerHTML = cols.map(([name, fn]) => {
    const list = prs.filter(fn).sort((a, b) => ts(a.u) - ts(b.u));
    return `<div class="col"><div class="col-head">${name}<span class="pill">${list.length}</span></div>${list.map((p) => prCard(p, isStale(p))).join('') || '<div class="empty small">Nothing here</div>'}</div>`;
  }).join('');
}
function prCard(p, stale) {
  const ci = { success: '<span class="pill ok">CI ✓</span>', failure: '<span class="pill bad">CI ✗</span>', pending: '<span class="pill warn">CI …</span>' }[p.ci] || '';
  const add = p.files.reduce((t, f) => t + f.add, 0), del = p.files.reduce((t, f) => t + f.del, 0);
  return `<div class="pr ${stale ? 'stale' : ''}">
    <a class="t" href="${repoUrl(`/pull/${p.n}`)}" target="_blank" rel="noopener"><span class="muted">#${p.n}</span> ${esc(p.title)}</a>
    <div class="row">${avatar(p.a, 'xs')} ${esc(P(p.a).name)} · opened ${ago(ts(p.c))}</div>
    <div class="row">${stale ? `<span class="pill warn">⏰ idle ${ago(ts(p.u)).replace(' ago', '')}</span>` : `<span>updated ${ago(ts(p.u))}</span>`} ${ci}
      <span><span class="plus">+${fmtNum(add)}</span> <span class="minus">−${fmtNum(del)}</span> · ${p.files.length} files</span></div>
    ${p.reviewers.length ? `<div class="row">Review requested: <span class="avatars">${p.reviewers.map((r) => avatar(r, 'xs')).join('')}</span></div>` : ''}
    ${p.screens?.length ? `<div class="row">${p.screens.map((s) => `<a class="pill" href="#screens">${esc(s.split('/')[1])}</a>`).join('')}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- milestones
function milestoneList() {
  // Counts come from the issue list (the API's counts also include PRs)
  const list = D.milestones.map((m) => {
    const is = D.issues.filter((i) => i.ms === m.title);
    return { ...m, open: is.filter((i) => i.s === 'open').length, closed: is.filter((i) => i.s === 'closed').length };
  });
  const none = D.issues.filter((i) => !i.ms);
  if (none.length) list.push({ title: 'No milestone', state: 'open', open: none.filter((i) => i.s === 'open').length, closed: none.filter((i) => i.s === 'closed').length, none: true });
  return list.sort((a, b) => (a.state === b.state ? a.title.localeCompare(b.title) : a.state === 'open' ? -1 : 1));
}
function renderMilestones() {
  const list = milestoneList();
  S.ms ??= (list.find((m) => m.state === 'open' && !m.none) || list[0])?.title;
  $('#milestoneCards').innerHTML = list.map((m) => {
    const total = m.open + m.closed, pct = total ? Math.round((100 * m.closed) / total) : 0;
    const due = m.due ? ts(m.due) : null;
    const dueTxt = due ? (due < NOW && m.state === 'open' ? `<span class="pill bad">overdue · ${fmtDate(due)}</span>` : `<span class="muted small">due ${fmtDate(due)}</span>`) : '';
    return `<div class="card ms ${S.ms === m.title ? 'on' : ''}" data-ms="${esc(m.title)}">
      <h3>${esc(m.title)} <span class="pill ${m.state === 'open' ? 'info' : 'ok'}">${m.state}</span></h3>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><span><b>${pct}%</b> <span class="muted small">${m.closed} closed / ${total}</span></span>${dueTxt}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.ms').forEach((el) => (el.onclick = () => { S.ms = el.dataset.ms; renderMilestones(); }));

  const open = D.issues.filter((i) => i.s === 'open');
  const load = {};
  for (const i of open) for (const a of i.as) load[a] = (load[a] || 0) + 1;
  const ls = Object.entries(load).sort((a, b) => b[1] - a[1]);
  chart('loadChart', {
    type: 'bar',
    data: { labels: ls.map(([l]) => P(l).name), datasets: [{ data: ls.map(([, n]) => n), backgroundColor: ls.map(([l]) => color(l)), borderRadius: 6, maxBarThickness: 30 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
  });
  const un = open.filter((i) => !i.as.length);
  $('#unassignedCount').textContent = un.length;
  $('#unassigned').innerHTML = un.map(issueRow).join('') || '<li class="empty">Every open issue has an owner 🎉</li>';
  renderMilestoneIssues();
}
function renderMilestoneIssues() {
  const m = milestoneList().find((x) => x.title === S.ms);
  const list = D.issues.filter((i) => (m?.none ? !i.ms : i.ms === S.ms) && i.s === S.msState);
  $('#msIssuesTitle').textContent = `Issues · ${S.ms || ''} (${list.length})`;
  $('#msIssues').innerHTML = list.map(issueRow).join('') || '<li class="empty">No issue</li>';
}
function issueRow(i) {
  return `<li><span class="num">#${i.n}</span><a class="title" href="${repoUrl(`/issues/${i.n}`)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    ${i.labels.map((l) => `<span class="label" style="color:#${esc(l.color)};border-color:#${esc(l.color)}">${esc(l.name)}</span>`).join('')}
    <span class="avatars">${i.as.map((a) => avatar(a, 'sm')).join('')}</span>
    <span class="muted small">${i.s === 'closed' ? `closed ${ago(ts(i.cl))}` : `opened ${ago(ts(i.c))}`}</span></li>`;
}
