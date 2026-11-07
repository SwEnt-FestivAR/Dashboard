# Roadmap

Features validated by the team, with the design choices already made. Implement them one at a time, following [AGENTS.md](AGENTS.md) (one commit per feature, update the docs in the same commit). Tick a feature when it ships.

## Decisions that apply to several features

- **Review data:** fetch reviews for **all** PRs with the GitHub **GraphQL** API (`pullRequests(first: 100) { reviews { … } }`, paginated, about 3–4 calls per run). Nothing is cached between runs.
- **History:** the workflow appends one small daily snapshot (open PRs, open/closed issues, screens per status, unassigned issues) to a JSON file on a dedicated **`data` branch** of this repo. That requires `permissions: contents: write` in `deploy.yml`. The site loads the file to draw trends. Keep the snapshot tiny (counts only).
- **Layout:** new views get **new tabs** (one module each in `site/js/tabs/`). Exceptions: the profile is a page opened from anywhere (`#person/<login>`), and the screen timeline is a "Cards / Timeline" toggle inside the Screens tab.

## Features

- [x] **This week tab:** a calendar week (Monday → Sunday) with ← → navigation. It lists merged PRs, closed issues, new screens, opened PRs, stale PRs and the most active people, and has a "Copy as Markdown" button for meetings or Discord.
- [ ] **Reviews tab, review stats:** per person, reviews given, median time to first review on their PRs, and review load balance.
- [ ] **Reviews tab, who-reviews-whom matrix:** a heatmap of reviewer × PR author. It highlights pairs and people who never get reviewed.
- [ ] **Reviews tab, PR cycle time:** open → merge time (weekly median, and per person), PR size buckets (S < 100, M < 400, L < 1000, XL lines changed), and a warning on XL PRs.
- [ ] **Profile page** (`#person/<login>`, opened by clicking any avatar or name): a GitHub-style activity calendar, plus their PRs, issues, screens authored and reviews.
- [ ] **Screens timeline:** a Gantt chart per screen showing first issue → file created → merged → finalized, as a toggle in the Screens tab.
- [ ] **Code tab, navigation graph:** **hand-made SVG**, no library. Screens are laid out in columns by feature, arrows come from FestivAR's navigation code (routes in `navigation/`), the color shows the status, and clicking opens the screen card. The edges are extracted in `fetch-data.mjs`.
- [ ] **Code tab, hotspots:** files ranked by number of changes × size (from `git log --numstat`), with their main owner and bus factor. These are refactoring candidates.
- [ ] **Global search (Ctrl+K):** a command palette over screens, PRs, issues and people, available on every tab.
- [ ] **History and trends:** curves of open PRs, open issues and screens per status over the semester, from the `data` branch snapshots (see above).

## Considered and not selected (for now)

CI health (success rate, flaky tests), milestone burndown, test coverage per screen (SonarCloud/Codecov), Figma links and screenshots per screen, filters stored in the URL, and a daily Discord/Slack digest posted by the workflow.
