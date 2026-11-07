# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Copilot, Cursor…) and for the humans driving them.
**Read all of it before changing anything.** The user-facing documentation is in [README.md](README.md). `CLAUDE.md` only imports this file.
**Planned work lives in [ROADMAP.md](ROADMAP.md)**: it lists the validated features and the design choices already made. Follow those choices, and tick a feature when it ships.

---

## 1. What this repo is

This repo is a static dashboard about the Android app repo [SwEnt-FestivAR/FestivAR](https://github.com/SwEnt-FestivAR/FestivAR). It is deployed to GitHub Pages by GitHub Actions.

- **FestivAR is read-only.** Never commit to it, open PRs or issues on it, or call write endpoints of its API. This repo only clones it and reads it.
- **No framework, no bundler, no `package.json`.**
  - The site is plain HTML, CSS, and native ES modules, plus Chart.js loaded from cdnjs as a global `Chart`.
  - The data script uses only Node built-ins (Node 20+).
  - Keep it that way unless the user explicitly asks otherwise.
- The site has 9 tabs (Contributors, This week, Screens, Open PRs, Reviews, Milestones, Code, Trends, and the hidden Profile page), a Ctrl+K search, and is built from three JSON files: the generated `data.json`, the hand-edited `status.json` and the daily `history.json` (from the `data` branch).

## 2. File organization

```
.
├── AGENTS.md / CLAUDE.md        this guide (CLAUDE.md just imports it)
├── README.md                    user documentation (features, statuses, deployment)
├── status.json                  manual screen statuses — edited by the team, by hand
├── aliases.json                 git email/name -> GitHub login, for unlinked commits
├── .github/workflows/deploy.yml clone FestivAR -> fetch data -> deploy site/ to Pages
├── scripts/
│   ├── fetch-data.mjs           builds site/data.json: documents its schema at the top, then orchestrates lib/
│   ├── lib/
│   │   ├── env.mjs              configuration (env vars) + git helper on the clone
│   │   ├── people.mjs           identities: git name/email -> GitHub login (resolve)
│   │   ├── github.mjs           REST (paginated, cached) + GraphQL reviews, open PR details
│   │   ├── repo.mjs             commits, hotspots, navigation graph (from git and files)
│   │   └── screens.mjs          screen units from main, open PRs and all branches, with tests
│   ├── snapshot.mjs             appends today's counts to history.json (data branch); reuses site/js/screens/units.js
│   └── serve.mjs                local static server (http://localhost:8080)
└── site/                        everything that gets published
    ├── index.html               shell only: top bar, empty <nav>, empty <main>, script tags
    ├── style.css                all styles, theme tokens on :root
    └── js/
        ├── main.js              entry: load JSON, build nav + sections from the registry, hash routing, theme
        ├── search.js            global Ctrl+K search palette
        ├── core/                shared, tab-agnostic code
        │   ├── utils.js         generic helpers (DOM, escaping, dates, numbers, sets). Knows nothing about the data
        │   ├── store.js         the loaded data (D, STATUS, NOW) + data-aware helpers (people, links, ago)
        │   └── ui.js            reusable HTML pieces (avatar, kpis, issueRow…) + chart helpers
        ├── screens/             domain code of the Screens tab
        │   ├── units.js         statuses, linked issues, planned screens (pure logic)
        │   ├── card.js          HTML of one screen card
        │   ├── timeline.js      Gantt view of the screens (Cards / Timeline toggle)
        │   └── status-dialog.js dialog that builds a status.json entry
        ├── reviews/
        │   └── stats.js         review / cycle time / PR size statistics, peer approvals (pure logic)
        ├── code/
        │   └── nav-graph.js     SVG of the navigation graph (hand-made layout)
        └── tabs/                one module per tab
            ├── index.js         THE TAB REGISTRY (order = nav order)
            ├── contributors.js
            ├── week.js
            ├── screens.js
            ├── prs.js
            ├── reviews.js       review stats, who-reviews-whom matrix, cycle time, PR sizes
            ├── milestones.js
            ├── code.js          navigation graph + hotspots (data.navigation, data.hotspots)
            ├── trends.js        curves from history.json (loaded on first display)
            └── person.js        profile page, hidden from the nav, route #person/<login>
```

Generated, git-ignored, **never committed**: `site/data.json`, `site/status.json` (copied at deploy time), `site/history.json` (copied from the `data` branch at deploy time), `festivar/` (the clone) and `.cache/`.

**The `data` branch** is an orphan branch holding only `history.json`, one small snapshot per day. Only the workflow writes it (`scripts/snapshot.mjs`, then a commit by `github-actions[bot]`). Never merge it into `main`, and never edit it by hand except to fix a corrupted entry. If you add a field to the snapshot, the site must still handle older entries that lack it.

### Dependency direction

```
main.js ──> tabs/index.js ──> tabs/*.js ──> screens/*.js, code/*.js, reviews/*.js ──> core/ui.js ──> core/store.js ──> core/utils.js
```

- Imports only go **left to right** (downwards).
- `core/` never imports from `screens/` or `tabs/`.
- A tab never imports another tab. If two tabs need the same thing, move it down into `core/`, or into a domain folder like `screens/`.
- No circular imports.

## 3. How it works

### Data flow

```
FestivAR clone (git log, git ls-files) ─┐
GitHub REST API (commits, pulls,        ├─> scripts/fetch-data.mjs ─> site/data.json ─┐
  issues, milestones, PR files/reviews) ┘                                             ├─> site/js/* renders
status.json (manual, this repo) ─────────────────────────────────────────────────────┘
```

### Runtime (site/js)

1. `main.js` loads `data.json` and `status.json`, then calls `initStore()`. From then on, `D`, `STATUS` and `NOW` are available to every module through ES live bindings.
2. It writes the nav links and one `<section id="tab-<id>" class="tab" hidden>` per registered tab, containing that tab's `html`.
3. It calls `setup()` once for each tab, then `render()` for the tab named in `location.hash` (the first tab by default). Changing the hash or the theme calls `render()` again.

### The tab contract (`js/tabs/index.js`)

```js
export default {
  id: 'prs',          // URL hash (#prs) and section id (tab-prs). Lowercase, unique
  label: 'Open PRs',  // nav text
  hidden: false,      // optional: true = not in the nav, only reachable by its route (see person.js)
  html: `...`,        // static markup: toolbars, empty containers, <canvas>
  setup() {},         // once at boot: bind controls, fill dropdowns, derive data the tab owns
  render(arg) {},     // every time the tab is shown: rebuild the dynamic parts from D + local state
};
```

- **Routes** are `#<tab id>` or `#<tab id>/<argument>`. `main.js` passes the decoded argument to `render(arg)`. For example, the search palette opens `#screens/TaskDetails`, which fills the Screens search box. Use routes to link into a tab: never set another tab's inputs directly.
- **Global features** that are not tabs live in their own module next to `main.js` and are initialized once from `main.js` after the tabs' `setup()`. Example: `search.js`, the Ctrl+K palette. Its index covers screens, people, PRs and issues; add new kinds of items in `buildIndex()`.

- **Each tab owns its UI state** in a module-level `const state = {…}`, with a comment per field. There is no global UI state.
- Controls update `state`, then call `render()`.
- Rendering = build an HTML string, assign it with `innerHTML`, then attach the listeners. Rebuilding everything is fine at this data size: don't add virtual DOM or diffing.

### Key domain concepts

- **People** are keyed by GitHub login everywhere. `resolve()` in `scripts/lib/people.mjs` maps git authors to logins (its comment lists the rules). For duplicates, add an entry to `aliases.json`. Never special-case a person in code.
- **Unit** = one screen = a `XxxScreen.kt` plus a `XxxViewModel.kt` paired by name, under `ui/<feature>/`. Files that exist only in an open PR are included with `inPR` set, and files that exist only in another branch (from `git diff origin/main...origin/<branch>` on the clone, see `branchChanges()` in `scripts/lib/screens.mjs`) with `inBranch` set. `branches` lists every branch touching the unit; the card shows the ones without an open PR as `⎇` pills. `ui/components` and `ui/theme` are skipped (`SKIP_FEATURES`). The unit id is `feature/Key`, which is also its key in `status.json`.
- **Initial author** = the author of the oldest commit of the file on main (`git log --follow`).
- **Tests** are linked by file name prefix (`CreateTask*Test.kt`): `androidTest/` = UI tests, `test/` = unit tests.
- **Statuses** (`STATUSES` in `screens/units.js`, in progress order):
  - planned = only named in an open issue
  - in-dev = not on main: only in an open PR or a branch
  - developed = on main
  - tested = UI tests, plus unit tests when there is a ViewModel
  - finalized and frozen are manual only, set in `status.json`. A frozen screen shows a warning if it changes after `since` or an open PR touches it.
- **Hotspots** (`hotspots()` in `scripts/lib/repo.mjs`): score = heat × log2(1 + complexity). heat = recency-weighted activity (each change halved every 14 days, weighted by log of lines changed); complexity = sum of indentation levels of code lines. Change the half-life or the formula there, and update the explanation text in `tabs/code.js`.
- **Navigation graph**: `navigationGraph()` in `scripts/lib/repo.mjs` reads the `AppScreens` enum (nodes) and the `navigate()` / `popBackStack()` calls of `class XNavigator` files (edges). If FestivAR changes this convention, update that function. On the site, columns and rows are ordered by distance from the start screen.
- **Issues of a screen** (`unitIssues`) = open issues whose normalized title contains the screen key, plus the numbers listed in `status.json → screens[id].issues`.
- **Planned screens** (`plannedUnits`) are derived in the browser, in the Screens tab `setup()`, from open issue titles such as "… the X Screen/ViewModel". One is created only when no unit named X exists yet. When a PR creates the file, the real unit replaces it automatically.
- **Site modules shared with Node**: `scripts/snapshot.mjs` imports `site/js/core/store.js` and `site/js/screens/units.js`, so the history uses exactly the same status rules as the Screens tab. Keep those two modules (and what they import) free of DOM access at import time: touch `document` only inside functions.
- **Weeks** run from **Friday 12:00 to the next Friday 12:00**, in the viewer's local time (`WEEK_START` in `core/utils.js`). Always group by week with `weekStart(t)` and move between weeks with `addWeeks(t, n)` (never `± 7 * DAY`, which drifts by an hour at daylight-saving changes). The This week tab, the "Approved this week" kanban column, weekly charts, cycle time and the profile calendar all follow this.
- **"Now"** is `NOW` = `data.generatedAt`, never `Date.now()`. Ages and periods are relative to the last data refresh. (Exception: the `since` date written by the status dialog is today's date.)

## 4. Recipes

**Add a tab**
1. Create `site/js/tabs/<name>.js` exporting the tab contract (copy the shape of `code.js`, a small tab with controls, or `trends.js` for one that loads its own data).
2. Import it in `site/js/tabs/index.js` and add it to `TABS` where it should appear in the nav.
3. Nothing else: `index.html` and `main.js` build the nav and the section from the registry.

**Add a section, card or chart to an existing tab:** add its markup to the tab's `html`, then fill it in `render()`. If a piece of HTML is used by two tabs, move it to `core/ui.js`.

**Add a chart:** put a `<canvas id>` inside a `.chart-box` (which gives it its height). Then:
- use `peopleBarChart(id, [[login, value]])` for per-person bars;
- otherwise use `chart(id, config)`, never `new Chart`: `chart()` destroys the old instance and applies theme colors;
- use `clearChart(id)` when there is nothing to draw;
- use `color(login)` so a person has the same color everywhere.

**Add a field to the data**
1. Compute it in the right module of `scripts/lib/` (or a new one), and add it to `data` in `scripts/fetch-data.mjs`.
2. Document it in the schema comment at the top of that file. **This is mandatory.**
3. Use it from `D` in the site.

Keep keys short (the file is downloaded on every visit), and prefer deriving values in the browser when they can be computed from what is already there.

**Add a screen status:** add it to `STATUSES` in `screens/units.js`, add its `--s-<id>` color in `style.css` `:root`, and document it in the README status table.

**Change screen detection** (when FestivAR's folders change): edit `UI_RE` / `SKIP_FEATURES` in `scripts/lib/screens.mjs`, re-run the fetch script, and check the Screens tab.

**Track another repo:** set the `REPO` and `FESTIVAR_DIR` environment variables and change the clone URL in `deploy.yml`. Only the screen naming (`UI_RE`, `SKIP_FEATURES`) and the navigation conventions (`navigationGraph()`) are FestivAR-specific.

## 5. Code conventions

### General
- **Small files.** Aim for under ~200 lines per JS file, and treat 250 as a hard limit: split by responsibility before reaching it (see how `screens/` is split into logic, card and dialog). This applies to `scripts/` too (see how `scripts/lib/` is split). Only `style.css` may be longer, organized in commented sections.
- **One responsibility per module**, named after what it contains (`card.js`, `units.js`), not `helpers2.js` or `misc.js`.
- **No duplication.** Before writing a helper, look in `core/utils.js` (generic), `core/store.js` (data-aware) and `core/ui.js` (HTML/charts). If you copy more than ~3 lines, extract a function instead.
- **No dead code.** No unused imports, exports, functions, variables or CSS classes, no commented-out code, no `console.log` left in the site. Delete code instead of disabling it: git keeps the history.
- **No speculative code.** Don't add options, parameters or abstractions "for later". Build what is needed now, in a way that is easy to extend.
- **Elegant over clever.** Prefer short, well-named functions, early returns (`if (!x) return …`) and plain loops or `map`/`filter`. Avoid nested ternaries deeper than one level, one-letter names (except `i`/`u`/`p`/`s` in short callbacks, matching the data keys), and long lines that need horizontal scrolling (~140 chars max).

### JavaScript
- ES modules, `import`/`export` with explicit `.js` extensions. Named exports for helpers, `export default` only for tab modules.
- `const` by default, `let` only when reassigned, never `var`.
- Naming:
  - camelCase for functions and variables;
  - UPPER_CASE for module constants (`STATUSES`, `STALE_DAYS`);
  - verb names for functions that do something (`renderSummary`, `openStatusDialog`);
  - noun names for functions that return HTML or values (`screenCard`, `unitIssues`).
- Dates are unix seconds (numbers) inside the site. Convert ISO strings with `ts()`, display them with `fmtDate()` / `ago()`.
- **Security:** every value coming from GitHub (titles, names, labels, branch names, logins) goes through `esc()` before `innerHTML`, including inside attributes. `nameOf()`, `avatar()`, `issueRow()` and `extLink()`'s href already escape; the `label` you pass to `extLink()` must already be safe.
- Event listeners use `addEventListener`, attached right after the `innerHTML` that created the elements.
- Use `try/catch` only around things that can really fail (fetch, `localStorage`, clipboard), and say in the `catch` why ignoring the error is fine.

### HTML / CSS
- `index.html` stays a shell. Tab markup lives in the tab module's `html`.
- Element ids are global, so make them unique across all tabs (prefix them with the tab, e.g. `prAuthor`, `msIssues`).
- Colors only as `var(--token)`. New colors become tokens on `:root`, with a dark value in **both** dark blocks (the `prefers-color-scheme` one and the `[data-theme="dark"]` one).
- Reuse the existing classes before adding new ones: `.card`, `.card-head`, `.kpis`, `.pill` (`.ok`/`.bad`/`.warn`/`.info`), `.seg`, `.toolbar`, `.issue-list`, `.empty`, `.grid2`, `.chart-box`.
- No inline `style=""` except for values computed from data (widths, `--c`/`--sc` colors).
- Mobile: there must be no horizontal page scroll at 375px wide. Only `.kanban` and `.tabs` scroll horizontally, on purpose.

### Data scripts (`scripts/`)
- Only Node built-ins, plus `git` called through `execFileSync`, never through a shell string.
- **No secrets.** The workflow only uses the automatic `GITHUB_TOKEN` of GitHub Actions; the team does not want to manage tokens or secrets. Don't add features that need one (a personal access token, a webhook URL…). If something cannot be done with `GITHUB_TOKEN` or without auth, leave it out.
- **API budget:** the workflow token allows about 1000 requests per hour.
  - Per-item calls (files, reviews, check-runs) are made only for **open** PRs.
  - Never add per-commit or per-closed-PR calls: use `git log` on the clone instead.
- Use `CACHE_DIR` when developing, to avoid burning the unauthenticated limit (60 requests per hour).

### Comments and documentation
- Every module starts with a comment saying what it is responsible for.
- Every exported function, and every non-obvious local one, gets a short `/** … */` comment saying **what it returns and the rules behind it**. Don't paraphrase the code. Comment the *why* and the domain rules ("credited to every assignee", "relative to NOW").
- When you change a behavior, update in the same commit:
  - the comment next to the code;
  - the `data.json` schema at the top of `fetch-data.mjs` (if the data changed);
  - this file (if the architecture, a convention or a recipe changed);
  - `README.md` (if users see the change).
- Code, comments and commit messages are written in **English**.

## 6. Don'ts

- Don't touch FestivAR in any way other than reading it.
- Don't add a framework, a bundler, TypeScript, npm dependencies or a `package.json` without the user's explicit approval. If a browser library is truly needed, load it from cdnjs with an exact pinned version.
- Don't commit generated files (`site/data.json`, `site/status.json`, `festivar/`, `.cache/`) or secrets or tokens.
- Don't hardcode people, screen names, issue numbers or milestones in the code. Derive them from the data, or put them in `status.json` / `aliases.json`.
- Don't use `Date.now()` for ages or periods (use `NOW`), and don't call `new Chart` directly (use `chart()`).
- Don't let a tab reach into another tab's DOM or state.
- Don't create `utils2.js`-style catch-all files, or leave TODOs, dead code or debug logs.
- Don't rewrite or reformat unrelated code in the same change.
- Don't push, force-push or rewrite published history unless the user asks.

## 7. Commits

- **One commit per logical change.** A feature, its docs and its styles can go together if they only make sense together; unrelated fixes or refactors go in separate commits. Never mix a refactor with a behavior change.
- Messages follow the existing history:
  - imperative mood, sentence case, no prefix, no final period, ideally under ~72 characters ("Show planned screens detected from open issue titles");
  - add a body after a blank line when the *why* isn't obvious.
- Commits made with an AI agent end with a `Co-Authored-By:` trailer naming the agent (see the existing history).
- Only commit on the user's request, and only push when they ask. `main` is deployed automatically on every push.
- Before committing, run the checks of section 9 and look at `git status` to make sure no generated file is staged.

## 8. Run it locally

```bash
git clone https://github.com/SwEnt-FestivAR/FestivAR.git festivar   # once; later: git -C festivar pull
CACHE_DIR=.cache node scripts/fetch-data.mjs                        # writes site/data.json
node scripts/serve.mjs                                              # http://localhost:8080
```

- ES modules don't load from `file://`, so always go through a server. `.claude/launch.json` starts `scripts/serve.mjs` for Claude Code's preview.
- Without `GITHUB_TOKEN`, `hasToken` is false: PR reviews and CI status are null, the kanban shows 2 columns instead of 4, and `prs[].rv` / `size` are missing (GraphQL has no anonymous access), so the Reviews tab only shows cycle time. To check the Reviews UI locally, inject fake `rv`/`size` values into your local `site/data.json` (it is git-ignored), then re-run the fetch script to restore it.
- On Windows PowerShell, set variables with `$env:CACHE_DIR='.cache'`, or use Git Bash.

## 9. Checking a change

There is no test suite, so verify by hand before every commit:
1. Syntax: `for f in $(find site/js scripts -name "*.*js"); do node --check "$f"; done`
2. No unused imports, exports or functions. Check every name you added or removed with a search across `site/js`.
3. Re-run the fetch script (with `CACHE_DIR`), open http://localhost:8080, click through **every** tab and the controls you touched, and check that the browser console has no errors.
4. Check light and dark themes (button top right), and a ~375px-wide window.
5. Workflow changes can only be tested on GitHub: after a push, check **Actions → Build & deploy dashboard**.
