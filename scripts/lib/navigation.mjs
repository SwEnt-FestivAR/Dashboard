// Navigation graph of the app, read from FestivAR's navigation/ folder (see navigationGraph()).

import { readFile } from './repo.mjs';

/**
 * Navigation graph read from FestivAR's navigation/ folder, following its conventions:
 *  - routes = entries of `enum class AppScreens { … }`
 *  - edges come from `class <Screen>Navigator` files: every `navigate(AppScreens.X…)` is a "go" edge and every
 *    `popBackStack(AppScreens.X…)` a "back" edge from <Screen> to X. Route helpers like `AppScreens.taskDetails(id)`
 *    map to `TaskDetails`. navigate() calls written directly in the NavGraph files are not read.
 */
export function navigationGraph(allFiles) {
  const screens = [];
  const edges = new Map();
  for (const f of allFiles.filter((x) => /^app\/src\/main\/.*\/navigation\/.*\.kt$/.test(x))) {
    const text = readFile(f);
    const enumBody = /enum class AppScreens\s*\{([^;}]*)/.exec(text);
    if (enumBody) screens.push(...enumBody[1].split(',').map((s) => s.trim()).filter(Boolean));
    const from = /class (\w+)Navigator\b/.exec(text)?.[1];
    if (!from) continue;
    for (const [, call, target] of text.matchAll(/\b(navigate|popBackStack)\(\s*AppScreens\.(\w+)/g)) {
      const to = target[0].toUpperCase() + target.slice(1);
      const kind = call === 'navigate' ? 'go' : 'back';
      if (to !== from) edges.set(`${from}>${to}>${kind}`, { from, to, kind });
    }
  }
  return { screens, edges: [...edges.values()] };
}
