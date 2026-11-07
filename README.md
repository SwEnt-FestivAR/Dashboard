# FestivAR Dashboard

A static dashboard for [SwEnt-FestivAR/FestivAR](https://github.com/SwEnt-FestivAR/FestivAR), deployed to GitHub Pages by GitHub Actions. It only **reads** FestivAR (git clone + public API) and never changes it.

**Tabs**
- **Contributors**: commits, merged PRs, open PRs, issues solved, and lines added/deleted per person, plus weekly activity. You can filter by period, hide bots, and click a person to focus the charts on them.
- **This week**: what happened in a calendar week (merged PRs, closed issues, new screens, most active people, stale PRs). Use ← → to change week and **Copy as Markdown** to paste a summary in a meeting or on Discord.
- **Screens**: Screen + ViewModel blocks grouped by feature (`ui/<feature>/`). Each block shows its initial author (the commit that created the file), dates, size, other contributors, tests, the open PRs touching it, and a status. Click **N open issues** on a card to see the open issues about that screen and who is assigned (issues are matched by title; add more with `"issues": [123]` in `status.json`). The **With open issues** filter keeps only those screens.
- **Open PRs**: a kanban of open PRs (draft / needs review / changes requested / approved), with CI status, stale PRs (> 3 days idle), and the screens each PR touches.
- **Code**: the app's navigation graph (screens by feature, arrows read from FestivAR's `*Navigator` classes, border = status; hover to highlight, click to open the screen), and hotspots, i.e. the files changed most often × their size. Each one shows its main owner and a "bus factor 1" warning when one person made 80%+ of the changes.
- **Milestones**: progress per milestone, open issues per person, unassigned issues, and the issue list for each milestone.

Each person has a **profile page** (the **Profile →** link on their card, or search for them) with an activity calendar, their open PRs, assigned issues and screens.

Press **Ctrl+K** (or **/**, or click **Search**) anywhere to search screens, people, PRs and issues.

## Screen statuses

| Status | Meaning | Source |
|---|---|---|
| Planned | not in the code yet, only named in an open issue ("Implement the My tasks Screen") | auto |
| In development | only exists in an open PR | auto |
| Developed | merged on `main` | auto |
| Tested | merged, has UI tests (+ ViewModel unit tests) | auto |
| Finalized | done, only small fixes expected | manual |
| Frozen | finalized, must not be touched anymore | manual |

Manual statuses go in [`status.json`](status.json). On the site, click a status badge to get the entry, then paste it into the file:

```json
{
  "screens": {
    "task/CreateTask": { "status": "frozen", "since": "2026-11-07", "note": "validated in demo" }
  }
}
```

If a frozen screen is modified after `since`, or touched by an open PR, its card shows **⚠ touched while frozen**.

## Deployment

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` runs on every push to `main`, every day at 05:00 UTC, and on demand (**Actions → Build & deploy dashboard → Run workflow**).

## Local preview

```bash
git clone https://github.com/SwEnt-FestivAR/FestivAR.git festivar
node scripts/fetch-data.mjs
node scripts/serve.mjs
```

Then open http://localhost:8080. Without a `GITHUB_TOKEN`, the GitHub API allows only 60 requests per hour, and the PR tab skips reviews and CI status. Set `CACHE_DIR=.cache` to cache API responses between runs.

`aliases.json` maps git emails or names that are not linked to a GitHub account onto a login, for example `"florian.chatelain@gmail.com": "ShymYoshi"`.
