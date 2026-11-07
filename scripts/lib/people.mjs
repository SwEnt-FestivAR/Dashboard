// Identities. Everyone is identified by GitHub login; git only knows names and emails, so resolve() maps
// them onto logins. `people` is written to data.json as is.

import fs from 'node:fs';

export const people = {}; // login -> { login, name, avatar, bot }

const emailToLogin = {}, nameToLogin = {}, shaToLogin = {};
// Manual identity fixes: { "git name or email": "github-login" }
const ALIASES = fs.existsSync('aliases.json') ? JSON.parse(fs.readFileSync('aliases.json', 'utf8')) : {};

/** Registers (or enriches) a person and returns their login. */
export function person(login, name, avatar, bot) {
  if (!login) return null;
  const p = (people[login] ||= { login, name: name || login, avatar: avatar || `https://github.com/${login}.png?size=96`, bot: !!bot });
  if (name && p.name === login) p.name = name;
  if (bot || /\[bot\]$/i.test(login)) p.bot = true;
  return login;
}

/** Login of a REST API user object (registers them), or null. */
export const fromApiUser = (u) => (u ? person(u.login, null, u.avatar_url, u.type === 'Bot') : null);

/** Learns sha/email/name -> login from the REST commit list of the default branch. Call before resolve(). */
export function learnFromApiCommits(apiCommits) {
  for (const c of apiCommits) {
    const login = fromApiUser(c.author);
    if (!login) continue;
    shaToLogin[c.sha] = login;
    const { email, name } = c.commit?.author || {};
    if (email) emailToLogin[email.toLowerCase()] = login;
    if (name) {
      nameToLogin[name.toLowerCase()] ||= login;
      if (people[login].name === login) people[login].name = name;
    }
  }
}

/**
 * Maps a git author (name, email, commit sha) to a GitHub login, trying in order:
 *  1. the login GitHub attached to that commit (learnFromApiCommits, default branch only)
 *  2. a GitHub noreply email (12345+login@users.noreply.github.com)
 *  3. an email or name already seen on a resolved commit
 *  4. aliases.json (email or name)
 *  5. a unique known person whose first name equals this git name ("Florian" -> "Florian Chatelain")
 *  6. otherwise a new pseudo-person named after the git name
 * If a contributor shows up twice on the site, add their email to aliases.json.
 */
export function resolve(name, email, sha) {
  if (shaToLogin[sha]) return shaToLogin[sha];
  const noreply = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email || '');
  if (noreply) return person(noreply[1], name);
  const lowerEmail = email?.toLowerCase(), lowerName = (name || '').toLowerCase();
  if (emailToLogin[lowerEmail]) return emailToLogin[lowerEmail];
  if (nameToLogin[lowerName]) return nameToLogin[lowerName];
  const alias = ALIASES[lowerEmail] || ALIASES[name];
  if (alias) return person(alias);
  const sameFirstName = Object.values(people).filter((p) => !p.bot && p.name.toLowerCase().split(/\s+/)[0] === lowerName);
  if (sameFirstName.length === 1) return (nameToLogin[lowerName] = sameFirstName[0].login);
  return person(name, name, `https://github.com/identicons/${encodeURIComponent(name)}.png`, /bot/i.test(name));
}
