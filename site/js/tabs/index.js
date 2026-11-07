// Tab registry: the nav shows the tabs in this order, and the first one is the default.
//
// A tab is a module whose default export is:
//   { id, label, html, setup(), render() }
//     id      used in the URL hash (#id) and the section id (tab-id)
//     label   text of the nav link
//     html    static markup of the section (toolbars, empty containers, canvases)
//     setup() called once at boot, after the data is loaded and the html is in the page: bind controls,
//             fill dropdowns
//     render() called each time the tab is shown or the theme changes; rebuilds the dynamic parts
// To add a tab, create js/tabs/<name>.js with that shape and add it to this list.

import contributors from './contributors.js';
import screens from './screens.js';
import prs from './prs.js';
import milestones from './milestones.js';

export const TABS = [contributors, screens, prs, milestones];
