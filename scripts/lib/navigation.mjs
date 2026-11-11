// Navigation graph of the app, read from FestivAR's navigation/ folder (see navigationGraph()).

import { readFile } from './repo.mjs';

const ROUTE_RE = /AppScreens\.(\w+)/;
const CALL_RE = /\b(navigate|popBackStack)\(\s*AppScreens\.(\w+)/g;

/** Route name of an `AppScreens.X` reference: route helpers like `taskDetails(id)` map to `TaskDetails`. */
const routeName = (name) => name[0].toUpperCase() + name.slice(1);

/** Links found in a piece of code: [{ to, kind }], "go" for navigate(AppScreens.X…), "back" for popBackStack(AppScreens.X…). */
function calls(code) {
  return [...code.matchAll(CALL_RE)].map(([, call, target]) => ({ to: routeName(target), kind: call === 'navigate' ? 'go' : 'back' }));
}

/** Top-level declarations of a Kotlin file (they start at column 0, as formatted by ktfmt). */
const declarations = (text) => text.split(/\n(?=\S)/);

/** Actions of every `class XNavigator`: { XNavigator: { action: [links] } }, one action per `val`. */
function navigatorActions(texts) {
  const out = {};
  for (const decl of texts.flatMap(declarations)) {
    const cls = /^class (\w+Navigator)\b/.exec(decl)?.[1];
    if (!cls) continue;
    out[cls] = Object.fromEntries(decl.split(/\n\s+val /).slice(1).map((p) => [/^\w+/.exec(p)[0], calls(p)]));
  }
  return out;
}

/**
 * Navigation graph: { screens: [AppScreens entries], edges: [{ from, to, kind }] }.
 * FestivAR's conventions:
 *  - routes = entries of `enum class AppScreens { … }`
 *  - each `composable(route = AppScreens.X…) { … }` of a NavGraph file is screen X. Its links are the
 *    navigator actions it wires (`navigator.onBack`, the navigator being any `class YNavigator`, even one shared
 *    by several screens), plus the navigate() / popBackStack() calls written in the block itself or in the
 *    file's own helper functions it calls (like RedirectToLogin).
 * popBackStack() without a route goes back to "whatever opened the screen" and cannot be drawn.
 */
export function navigationGraph(allFiles) {
  const texts = allFiles.filter((f) => /^app\/src\/main\/.*\/navigation\/.*\.kt$/.test(f)).map(readFile);
  const actions = navigatorActions(texts);
  const screens = [];
  const edges = new Map();
  for (const text of texts) {
    const enumBody = /enum class AppScreens\s*\{([^;}]*)/.exec(text);
    if (enumBody) screens.push(...enumBody[1].split(',').map((s) => s.trim()).filter(Boolean));
    const decls = declarations(text);
    const helpers = decls.map((d) => /^(?:private )?fun (\w+)\(/.exec(d)).filter(Boolean).map((m) => [m[1], m.input]);
    for (const block of decls.flatMap((d) => d.split(/\bcomposable\(/).slice(1))) {
      const from = routeName(ROUTE_RE.exec(block)?.[1] || '');
      const navigator = actions[/\b(\w+Navigator)\(/.exec(block)?.[1]] || {};
      const links = [
        ...[...block.matchAll(/\bnavigator\.(\w+)/g)].flatMap(([, action]) => navigator[action] || []),
        ...calls(block),
        ...helpers.filter(([name]) => block.includes(`${name}(`)).flatMap(([, code]) => calls(code)),
      ];
      for (const { to, kind } of links) if (to !== from) edges.set(`${from}>${to}>${kind}`, { from, to, kind });
    }
  }
  return { screens, edges: [...edges.values()] };
}
