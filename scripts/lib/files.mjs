// Graph of every Kotlin file of app/src and of which file uses which (data.files), shown as the file graph and list of the Code tab.

import path from 'node:path';
import { countLines, readFile } from './repo.mjs';

/**
 * { p: [paths], l: [lines], e: [[i, j]] }: the Kotlin files of app/src (production and tests), and an edge
 * i → j when file i mentions the class of file j, i.e. its file name without ".kt" as a whole word. It is
 * the same signal as the hotspot usages: Kotlin names a file after its main class and needs no import within
 * a package. When several files share a name, a mention links to all of them.
 */
export function fileGraph(allFiles) {
  const p = allFiles.filter((f) => f.startsWith('app/src/') && f.endsWith('.kt'));
  const texts = p.map(readFile);
  const byName = new Map();
  p.forEach((f, i) => byName.set(path.basename(f, '.kt'), [...(byName.get(path.basename(f, '.kt')) || []), i]));
  const e = [];
  texts.forEach((text, i) => {
    for (const word of new Set(text.match(/\b[A-Za-z_]\w*/g))) {
      for (const j of byName.get(word) || []) if (j !== i) e.push([i, j]);
    }
  });
  return { p, l: texts.map(countLines), e };
}
