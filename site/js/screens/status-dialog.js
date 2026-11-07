// Dialog to change a screen status. A static site cannot write to the repo, so it only builds the
// status.json entry: the user copies it into the file on GitHub, and that push redeploys the site.

import { $, $$, seg } from '../core/utils.js';
import { D, statusFileUrl } from '../core/store.js';
import { STATUSES, unitId, unitStatus } from './units.js';

const HTML = `
  <dialog id="statusDialog">
    <form method="dialog">
      <h3>Change status of <span id="dlgName"></span></h3>
      <p class="muted small">Statuses are shared through <code>status.json</code> in the dashboard repo. Pick a status,
        copy the entry and paste it into the file; the site updates after the next deploy.</p>
      <div class="seg" id="dlgStatuses">${STATUSES.map((s) => `<button type="button" data-s="${s.id}">${s.label}</button>`).join('')}</div>
      <label class="small">Note (optional)<input id="dlgNote" type="text" placeholder="e.g. waiting for design review"></label>
      <pre id="dlgJson"></pre>
      <div class="dlg-actions">
        <button type="button" id="dlgCopy">Copy entry</button>
        <a id="dlgEdit" class="btn primary" target="_blank" rel="noopener">Edit status.json on GitHub ↗</a>
        <button value="close">Close</button>
      </div>
    </form>
  </dialog>`;

const current = { id: null, status: null };

/** Adds the dialog to the page. Call once, after the data is loaded. */
export function initStatusDialog() {
  document.body.insertAdjacentHTML('beforeend', HTML);
  seg('#dlgStatuses', 's', (s) => { current.status = s; showEntry(); });
  $('#dlgNote').addEventListener('input', showEntry);
  $('#dlgEdit').href = statusFileUrl('edit');
  $('#dlgCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#dlgJson').textContent);
      $('#dlgCopy').textContent = 'Copied ✓';
    } catch {
      $('#dlgCopy').textContent = 'Select & copy manually';
    }
    setTimeout(() => ($('#dlgCopy').textContent = 'Copy entry'), 1500);
  });
}

/** Opens the dialog for a unit id ("task/CreateTask"), preselecting its current status and note. */
export function openStatusDialog(id) {
  const u = D.units.find((x) => unitId(x) === id);
  const st = unitStatus(u);
  Object.assign(current, { id, status: st.status });
  $('#dlgName').textContent = u.key;
  $('#dlgNote').value = st.note || '';
  for (const b of $$('#dlgStatuses button')) b.classList.toggle('on', b.dataset.s === current.status);
  showEntry();
  $('#statusDialog').showModal();
}

function showEntry() {
  const entry = { status: current.status, since: new Date().toISOString().slice(0, 10) };
  const note = $('#dlgNote').value.trim();
  if (note) entry.note = note;
  $('#dlgJson').textContent = `"${current.id}": ${JSON.stringify(entry)},`;
}
