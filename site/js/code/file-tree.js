// File list of the Code tab: every Kotlin file of app/src in collapsible folders, with its size and how many
// files use it, and the panel of the selected file (the files it uses and the files that use it).

import { esc, plural } from '../core/utils.js';
import { D, repoUrl } from '../core/store.js';
import { areaColor, byFileName, children, countFiles, fileName, folderTree, isTest } from './files.js';

const OPEN_DEPTH = 0; // folders open at first display: the top level only

/** HTML of the list of the given files. Folders are <details>; each file is a button carrying its index. */
export function fileTreeHtml(indexes, links) {
  const colorOf = areaColor(indexes);
  const usedBy = (i) => (links.usedBy[i].size ? ` · used by ${links.usedBy[i].size}` : '');
  const fileRow = (i) => `<li><button class="ft-file${isTest(D.files.p[i]) ? ' test' : ''}" data-i="${i}"
      style="--c:${colorOf(i)}" title="${esc(D.files.p[i])}">
    <span class="ft-dot"></span><span class="ft-name">${esc(fileName(i))}</span>
    <span class="ft-meta">${D.files.l[i]} lines${usedBy(i)}</span></button></li>`;
  const folder = (node, depth) => {
    const { dirs, files } = children(node);
    return `<li><details${depth <= OPEN_DEPTH ? ' open' : ''}><summary><span class="ft-folder">${esc(node.name)}</span>
      <span class="ft-meta">${countFiles(node)}</span></summary>
      <ul>${dirs.map((d) => folder(d, depth + 1)).join('')}${files.map(fileRow).join('')}</ul></details></li>`;
  };
  const { dirs, files } = children(folderTree(indexes));
  return `<ul class="file-tree">${dirs.map((d) => folder(d, 0)).join('')}${files.map(fileRow).join('')}</ul>`;
}

/** HTML of the panel of the selected file: what it uses and what uses it, each a button selecting that file. */
export function filePanelHtml(i, links) {
  if (i === null) return '<div class="empty">Click a file to see what it uses and what uses it.</div>';
  const list = (set, empty) => [...set].sort(byFileName)
    .map((j) => `<li><button class="ft-link" data-i="${j}" title="${esc(D.files.p[j])}">${esc(fileName(j))}</button></li>`)
    .join('') || `<li class="empty">${empty}</li>`;
  const f = D.files.p[i];
  return `<h4><a href="${esc(repoUrl(`/blob/${D.branch}/${f}`))}" target="_blank" rel="noopener">${esc(fileName(i))}</a></h4>
    <p class="muted small">${esc(f.replace(/^app\/src\//, ''))} · ${D.files.l[i]} lines</p>
    <h5 class="ft-uses">Uses ${plural(links.uses[i].size, 'file')}</h5><ul>${list(links.uses[i], 'Nothing from this repo')}</ul>
    <h5 class="ft-usedby">Used by ${plural(links.usedBy[i].size, 'file')}</h5><ul>${list(links.usedBy[i], 'No other file')}</ul>`;
}
