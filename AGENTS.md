# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Copilot, Cursor…) and the humans driving them.
Read this before changing anything. The user-facing documentation is in [README.md](README.md).

## What this repo is

This repo is a static dashboard about the Android app repo [SwEnt-FestivAR/FestivAR](https://github.com/SwEnt-FestivAR/FestivAR). It is deployed to GitHub Pages by GitHub Actions.

- **FestivAR is read-only.** Never commit to it, open PRs on it, or write to its API. This repo only clones it and reads it.
- There is no framework, no bundler and no `package.json`. The site is plain HTML/CSS/JS, plus Chart.js from cdnjs. The data script uses only Node built-ins (Node 20+). Keep it that way unless the user asks otherwise.

## Files

| Path | Role |
|---|---|
| `scripts/fetch-data.mjs` | Reads a FestivAR clone (git log) and the GitHub API, then writes `site/data.json`. **The `data.json` schema is documented at the top of this file.** |
| `site/index.html` | Page skeleton: top bar, one `<section id="tab-…">` per tab, and the status dialog. |
| `site/app.js` | All rendering. One `render<Tab>()` function per tab, a shared state `S`, and helpers. Its architecture comment is at the top. |
| `site/style.css` | Styles. Color tokens on `:root`, with dark-mode overrides. |
| `status.json` | Manual screen statuses, notes and extra issue links. The team edits it by hand, and it is copied into `site/` at deploy time. |
| `aliases.json` | Maps git emails or names to GitHub logins, for commits not linked to an account. |
| `scripts/serve.mjs` | Local static server on port 8080. It serves the root `status.json` when `site/status.json` does not exist. |
| `.github/workflows/deploy.yml` | Clones FestivAR, runs the fetch script with `GITHUB_TOKEN`, then deploys `site/` to Pages. Runs on push to main, daily at 05:00 UTC, and on demand. |

`site/data.json`, `site/status.json` and `festivar/` are generated, and they are git-ignored. Never commit them.

## Run it locally

```bash
git clone https://github.com/SwEnt-FestivAR/FestivAR.git festivar   # once; add `git -C festivar pull` later
CACHE_DIR=.cache node scripts/fetch-data.mjs                        # writes site/data.json
node scripts/serve.mjs                                              # http://localhost:8080
```

- Without `GITHUB_TOKEN`, the API allows 60 requests per hour, and one fresh run uses about 40. `CACHE_DIR` stores the responses so later runs cost 0. Delete `.cache/` to get fresh data.
- Without a token, `hasToken` is false, so `openPRs[].review` and `.ci` are null and the PR kanban shows only 2 columns (Draft / Ready for review). With a token, it shows 4.
- On Windows, set environment variables the PowerShell way (`$env:CACHE_DIR='.cache'`), or use Git Bash.

## How the data flows

```
FestivAR clone (git log, git ls-files) ─┐
GitHub REST API (commits, pulls,        ├─> scripts/fetch-data.mjs ─> site/data.json ─┐
  issues, milestones, PR files/reviews) ┘                                             ├─> site/app.js renders
status.json (manual, this repo) ─────────────────────────────────────────────────────┘
```

Key concepts:
- **People** are keyed by GitHub login everywhere. `resolve()` in the fetch script maps git authors to logins (see its comment for the rules). If someone appears twice, add an entry to `aliases.json`. Do not special-case them in code.
- **Units** are the screens: a `Screen.kt` and a `ViewModel.kt` paired by shared prefix, grouped by the folder under `ui/` (= feature). Files that exist only in an open PR are included, with `inPR` set. `ui/components` and `ui/theme` are skipped (`SKIP_FEATURES`).
- **Initial author** = the author of the oldest commit of the file on main, using `git log --follow`.
- **Tests** are linked to a unit by file name prefix (`CreateTask*Test.kt`): `androidTest/` = UI tests, `test/` = unit tests.
- **Screen status** is `status.json` if set, otherwise `autoStatus()`:
  - in-dev = only in an open PR
  - developed = on main
  - tested = UI tests, plus unit tests when there is a ViewModel
  - `finalized` and `frozen` are manual only.
  - A frozen screen gets a warning if it changes after `since` or an open PR touches it.
- **Issues of a screen** = open issues whose title contains the screen key once spaces and punctuation are removed (`unitIssues()`), plus the numbers listed in `status.json → screens[id].issues`.
- **"Now"** in the UI is `data.generatedAt`, not the browser clock. Ages and periods are relative to the last data refresh.

## Recipes

**Add a field to the data:** compute it in `fetch-data.mjs`, add it to the schema comment at the top, then use it in `app.js`. Keep keys short: the file is loaded on every visit.

**Add a tab:**
1. In `index.html`: add `<a href="#x" data-tab="x">` in `#tabs` and a `<section id="tab-x" class="tab" hidden>`.
2. In `app.js`: write `renderX()`, and register it in `showTab()` (both the `valid` list and the render map).
3. Bind its controls once in `setupControls()`. Its state goes in `S`.

**Add a chart:** put a `<canvas id>` inside a `.chart-box` (it gives the height), then call `chart(id, config)`. Do not call `new Chart` directly: `chart()` destroys the old instance and applies theme colors. Use `color(login)` for per-person colors so a person has the same color in every chart.

**Add a screen status:** add it to `STATUSES` in `app.js`, with a `--s-<id>` color variable in `style.css` `:root`. Manual statuses are validated against this list.

**Change the screen detection** (FestivAR folders change): edit `UI_RE` / `SKIP_FEATURES` in `fetch-data.mjs`, re-run the script, and check the Screens tab.

**Track another repo:** set `REPO` and `FESTIVAR_DIR` (env vars), and update the clone URL in `deploy.yml`. Nothing else is FestivAR-specific, except the `SKIP_FEATURES` folder names.

## Rules

- **Escape GitHub text.** Every title, name, label or branch inserted with `innerHTML` must go through `esc()`. Issue and PR titles are written by anyone.
- **Theme-safe colors:** use `var(--token)` in CSS. Canvas colors go through `css('--token')` or the palette, never raw colors that only work in one theme. Check both light and dark (theme button, top right).
- **Mobile:** there must be no horizontal scroll at 375px wide. The kanban scrolls horizontally on purpose.
- **API budget:** the workflow's `GITHUB_TOKEN` allows about 1000 requests per hour. Per-PR calls (files, reviews, check-runs) are made only for open PRs. Do not add per-commit or per-closed-PR calls; use `git log` on the clone instead.
- **No new runtime dependencies** without asking the user. If you need a library in the browser, load a pinned exact version from cdnjs.
- **Don't commit generated files** (`site/data.json`, `site/status.json`, `festivar/`, `.cache/`).
- **Comments:** keep the schema comment in `fetch-data.mjs` and the architecture comment in `app.js` up to date when you change their subject.

## Checking a change

There is no test suite. Before committing:
1. `node --check site/app.js && node --check scripts/fetch-data.mjs`
2. Re-run the fetch script (with `CACHE_DIR`), then open http://localhost:8080. Click through the 4 tabs and check the browser console for errors.
3. Check dark and light themes, and a narrow window (about 375px).
4. Workflow changes can only be tested on GitHub: push, then look at **Actions → Build & deploy dashboard**.
