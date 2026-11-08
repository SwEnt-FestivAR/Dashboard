// Issues sections of the This week tab: what each person has on their plate (open issues assigned to them
// right now, plus the issues they closed during the selected week) and the open issues nobody is assigned
// to, split into user stories and tasks. Also their part of the "Copy as Markdown" summary.

import { esc, plural, ts } from '../core/utils.js';
import { D, P, isCompleted, nameOf, repoUrl } from '../core/store.js';
import { avatar, extLink, listItems } from '../core/ui.js';

/** User stories carry the "user story" label or a "US-12: …" title; every other issue is a task. */
const isUserStory = (i) => i.labels.some((l) => l.name.toLowerCase() === 'user story') || /^US-\d+/i.test(i.title);

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
      else if (isCompleted(i) && ts(i.cl) >= from && ts(i.cl) < to) of(login).closed.push(i);
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

/** A framed list with a header and a count. `tone` colors the header: "open", "closed" or "" (neutral). */
const issueBox = (title, items, empty, tone = '') => `<div class="pi-box ${tone}">
  <div class="pi-box-head">${title}<span class="pill">${items.length}</span></div>
  <ul class="issue-list">${listItems(items, issueLine, empty)}</ul></div>`;

/** One block per person, with two boxes: the issues assigned to them now and the ones they closed this week. */
export function peopleIssuesHtml(people) {
  if (!people.length) return '<div class="empty">Nobody has assigned issues</div>';
  return people.map((p) => `<div class="pi-person">
    <div class="pi-head">${avatar(p.login, 'sm')}<b>${nameOf(p.login)}</b></div>
    ${issueBox('Assigned now', p.open, 'Nothing assigned', 'open')}
    ${issueBox('Closed this week', p.closed, 'Nothing closed', 'closed')}
  </div>`).join('');
}

/** Two boxes side by side: unassigned user stories and unassigned tasks. */
export function unassignedHtml({ stories, tasks }) {
  return issueBox('User stories', stories, 'None 🎉') + issueBox('Tasks', tasks, 'None 🎉');
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
