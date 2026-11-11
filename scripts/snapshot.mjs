// Appends today's snapshot (a few counts) to the history file kept on the `data` branch.
// Usage: node scripts/snapshot.mjs <history.json> [data.json] [status.json]
//
// Screen statuses are computed with the site's own modules (site/js/screens/units.js), so the history
// always uses exactly the same rules as the Screens tab. Those modules only touch the DOM inside functions,
// so they can be imported by Node.
//
// history.json = [{ d: "YYYY-MM-DD", prsOpen, prsDraft, issuesOpen, issuesUnassigned, issuesClosed,
//                   screens: { <status id>: count } }], oldest first, at most one entry per day.
// Every run replaces the entry of its day, so each day keeps the values of its LAST build. Days are counted in
// Swiss time (TEAM_TIME_ZONE), like the schedule of the workflow: a run at 00:17 belongs to the new day.

import fs from 'node:fs';
import { D, initStore } from '../site/js/core/store.js';
import { STATUSES, plannedUnits, unitStatus } from '../site/js/screens/units.js';

const [historyFile, dataFile = 'site/data.json', statusFile = 'status.json'] = process.argv.slice(2);
if (!historyFile) throw new Error('Usage: node scripts/snapshot.mjs <history.json> [data.json] [status.json]');

const TEAM_TIME_ZONE = 'Europe/Zurich';

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

initStore(readJson(dataFile), readJson(statusFile, {}));
D.units.push(...plannedUnits(D.units, D.issues));

const openIssues = D.issues.filter((i) => i.s === 'open');
const snapshot = {
  d: new Date(D.generatedAt).toLocaleDateString('sv-SE', { timeZone: TEAM_TIME_ZONE }), // sv-SE = YYYY-MM-DD
  prsOpen: D.openPRs.length,
  prsDraft: D.openPRs.filter((p) => p.d).length,
  issuesOpen: openIssues.length,
  issuesUnassigned: openIssues.filter((i) => !i.as.length).length,
  issuesClosed: D.issues.length - openIssues.length,
  screens: Object.fromEntries(STATUSES.map((s) => [s.id, D.units.filter((u) => unitStatus(u).status === s.id).length])),
};

const history = readJson(historyFile, []).filter((h) => h.d !== snapshot.d); // re-runs on the same day replace it
history.push(snapshot);
history.sort((a, b) => a.d.localeCompare(b.d));
fs.writeFileSync(historyFile, `${JSON.stringify(history, null, 1)}\n`);
console.log(`Snapshot ${snapshot.d} written to ${historyFile} (${history.length} days)`);
