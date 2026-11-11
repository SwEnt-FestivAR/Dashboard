# FestivAR Dashboard

A static dashboard for [SwEnt-FestivAR/FestivAR](https://github.com/SwEnt-FestivAR/FestivAR), deployed to GitHub Pages by GitHub Actions. It only **reads** FestivAR (git clone + public API) and never changes it.

**Tabs**
- **Contributors**: commits, merged PRs, open PRs, issues solved (closed as completed, not "not planned"), and lines added/deleted per person, plus weekly activity. You can filter by period, hide bots, and click a person to focus the charts on them.
- **This week**: what happened in a week, i.e. **from Friday 12:00 to the next Friday 12:00** (the sprint boundary): merged PRs, closed issues, new screens, most active people, stale PRs. It also shows, **per person**, every open issue assigned to them right now and the issues they closed during the week, and the **unassigned open issues** split into user stories (label "user story" or "US-XX:" title) and tasks. Weekly charts and the profile calendar use the same weeks. Use ← → to change week and **Copy as Markdown** to paste a summary in a meeting or on Discord.
- **Screens**: Screen + ViewModel blocks grouped by feature (`ui/<feature>/`). Each block shows its initial author (the commit that created the file), dates, size, other contributors, tests, the open PRs and other branches (`⎇`) touching it, and a status. Click **N open issues** on a card to see the open issues about that screen and who is assigned (issues are matched by title; add more with `"issues": [123]` in `status.json`). The **With open issues** filter keeps only those screens. Switch to **Timeline** to see each screen as a Gantt bar split into status periods: from when to when it was planned, in development, developed or finalized (hover a segment for its dates). The periods are recomputed from the data with the same rules (file dates on `main`, issue open/close dates), so they cover the whole project, not just the days since the history started.
- **Open PRs**: a kanban of open PRs (draft / needs review / changes requested), with CI status, stale PRs (> 3 days idle), and the screens each PR touches (click one to open its card in the Screens tab). The last row of each card shows **who reviews it**: ✓ approved, ✗ changes requested, 💬 commented, ⏳ review requested but not done yet (submitted reviews need the review data of the deployed site). Filter by author and/or by reviewer. The last column, **Approved this week**, lists the PRs approved during the current week (Friday 12:00 → Friday 12:00), merged ones included; a PR approved before that and still open goes back to "Needs review".
- **Reviews**: PRs reviewed per person, median wait before the first review, a who-reviews-whom heatmap, weekly PR cycle time (open → merge) and PR sizes (S/M/L/XL). Review data comes from the GraphQL API, read with the `GITHUB_TOKEN` that GitHub Actions creates automatically for every run: **there is no token or secret to set up**. It appears on the deployed site; locally, only cycle time is shown.
- **Milestones**: progress per milestone, open issues per person, unassigned issues, and the issue list for each milestone.
- **Code**: the app's navigation graph (screens by feature, arrows read from FestivAR's NavGraph files and `*Navigator` classes, border = status; hover to highlight, click to open the screen), and hotspots, ranked by a score out of 100: **50%** how many other files use the file, **30%** its recent activity (changes halved every 14 days), **20%** its size in lines (each criterion as a percentile among production files). The top files are central, changing now and big: they deserve the most care. Each one shows its main owner and a "bus factor 1" warning when one person made 80%+ of the changes.
- **Trends**: curves of open PRs, open and unassigned issues, and screens per status over the semester. Each workflow run saves a snapshot in `history.json` on the `data` branch of this repo, replacing the one of the same day, so each day keeps the values of its last build (days in Swiss time).

Each person has a **profile page** (the **Profile →** link on their card, or search for them) with an activity calendar, their open PRs, assigned issues and screens.

Press **Ctrl+K** (or **/**, or click **Search**) anywhere to search screens, people, PRs and issues.

## Screen statuses

| Status | Meaning | Source |
|---|---|---|
| Planned | not in the code yet, only named in an open issue ("Implement the My tasks Screen") | auto |
| In development | the Screen or the ViewModel is not on `main` yet, **or** an open issue is about it | auto |
| Developed | Screen and ViewModel on `main`, no open issue about it (open PRs and branches touching it are shown on the card but do not change the status) | auto |
| Finalized | done and validated by the team | manual |

Hover the status badge of a card to see why a screen is still in development (e.g. "ViewModel not on main, 2 open issues").

**Finalized** is the only status set by hand, in [`status.json`](status.json). On the site, click a status badge to get the entry, then paste it into the file:

```json
{
  "screens": {
    "task/CreateTask": { "status": "finalized", "since": "2026-11-07", "note": "validated in demo" }
  }
}
```

`since` is the finalization date, shown on the timeline.

## Deployment

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow needs to push the daily snapshot to the `data` branch. It asks for `contents: write`; if the organization restricts that, allow it in **Settings → Actions → General → Workflow permissions** ("Read and write permissions").
4. The workflow `.github/workflows/deploy.yml` runs on every push to `main`, every hour except between 01:30 and 07:30 Swiss time (summer time included), and on demand (**Actions → Build & deploy dashboard → Run workflow**).

## Local preview

```bash
git clone https://github.com/SwEnt-FestivAR/FestivAR.git festivar
node scripts/fetch-data.mjs
node scripts/serve.mjs
```

Then open http://localhost:8080. Without a `GITHUB_TOKEN`, the GitHub API allows only 60 requests per hour, the PR tab skips reviews and CI status, and the Reviews tab only shows cycle time. Set `CACHE_DIR=.cache` to cache API responses between runs. The Trends tab stays empty locally, because `history.json` only exists on the deployed site.

`aliases.json` maps git emails or names that are not linked to a GitHub account onto a login, for example `"florian.chatelain@gmail.com": "ShymYoshi"`.
