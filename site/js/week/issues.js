// Issues sections of the This week tab: what each person has on their plate (open issues assigned to them
// right now, plus the issues they closed during the selected week) and the open issues nobody is assigned
// to, split into user stories and tasks. Also their part of the "Copy as Markdown" summary.

import { esc, plural, ts } from '../core/utils.js';
import { D, P, nameOf, repoUrl } from '../core/store.js';
import { avatar, extLink, listItems } from '../core/ui.js';

/** User stories carry the "user story" label or a "US-12: …" title; every other issue is a task. */
const isUserStory = (i) => i.labels.some((l) => l.name.toLowerCase() === 'user story') || /^US-\d+/i.test(i.title);

const completed = (i) => i.s === 'closed' && i.r !== 'not_planned';

/**
 * Per person (bots excluded): { login, open: issues assigned now, closed: issues closed in [from, to) }.
 * An issue with several assignees counts for each of them. Most loaded people first.
 */
export function issuesByPerson(from, to) {
  const people = {};
  const of = (login) => (people[login] ||= { login, open: [], closed: [] });
  for (const i of D.issues) {
    for (const login of i.as.filter((l) => !P(l).bot)) {
      if (i.s === 'open') of(login).open.push(i);
      else if (completed(i) && ts(i.cl) >= from && ts(i.cl) < to) of(login).closed.push(i);
    }
  }
  const load = (p) => p.open.length + p.closed.length;
  return Object.values(people).sort((a, b) => load(b) - load(a));
}

/** Open issues without assignee: { stories, tasks }, oldest first. */
export function unassignedIssues() {
  const open = D.issues.filter((i) => i.s === 'open' && !i.as.length).sort((a, b) => ts(a.c) - ts(b.c));
  return { stories: open.filter(isUserStory), tasks: open.filter((i) => !isUserStory(i)) };
}

const issueLine = (i) => `<li><span class="num">#${i.n}</span>${extLink(repoUrl(`/issues/${i.n}`), esc(i.title), 'title')}
  ${isUserStory(i) ? '<span class="pill info">US</span>' : ''}</li>`;

/** One block per person with their assigned issues and the ones they closed this week. */
export function peopleIssuesHtml(people) {
  if (!people.length) return '<div class="empty">Nobody has assigned issues</div>';
  return people.map((p) => `<div class="pi-person">
    <div class="pi-head">${avatar(p.login, 'sm')}<b>${nameOf(p.login)}</b>
      <span class="pill">${p.open.length} open</span><span class="pill ok">${p.closed.length} closed this week</span></div>
    <h4>Assigned now</h4><ul class="issue-list">${listItems(p.open, issueLine, 'Nothing assigned')}</ul>
    <h4>Closed this week</h4><ul class="issue-list">${listItems(p.closed, issueLine, 'Nothing closed')}</ul>
  </div>`).join('');
}

/** Two columns: unassigned user stories and unassigned tasks. */
export function unassignedHtml({ stories, tasks }) {
  const column = (title, items) => `<div><h4>${title} <span class="pill">${items.length}</span></h4>
    <ul class="issue-list">${listItems(items, issueLine, 'None 🎉')}</ul></div>`;
  return column('User stories', stories) + column('Tasks', tasks);
}

/** Markdown of both sections, for the weekly summary. */
export function issuesMarkdown(people, { stories, tasks }) {
  const line = (i) => `  - #${i.n} ${i.title}`;
  const person = (p) => `- **${P(p.login).name}** (@${p.login}): ${p.open.length} open, ${p.closed.length} closed this week`
    + (p.closed.length ? `\n  Closed:\n${p.closed.map((i) => `  ${line(i)}`).join('\n')}` : '')
    + (p.open.length ? `\n  Assigned:\n${p.open.map((i) => `  ${line(i)}`).join('\n')}` : '');
  const unassigned = (title, items) => (items.length ? `\n**${title}** (${items.length})\n${items.map((i) => `- #${i.n} ${i.title}`).join('\n')}\n` : '');
  return `\n### Issues per person\n${people.map(person).join('\n')}\n`
    + `\n### Unassigned open issues (${plural(stories.length + tasks.length, 'issue')})\n`
    + `${unassigned('User stories', stories)}${unassigned('Tasks', tasks)}`;
}
