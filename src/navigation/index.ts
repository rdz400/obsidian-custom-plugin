/**
 * Navigation
 * ==========
 *
 * Getting around quickly: within a note, to recently created notes, and
 * between open tabs.
 *
 * How to use it
 * -------------
 * - "Show outline of this note" lists the note's headings, indented by level;
 *   choosing one jumps to it.
 * - "Show recently created notes" (also a ribbon icon) lists the 80 newest
 *   notes by their `datum` frontmatter, newest first. Daily notes (type
 *   dagnotitie) and templates are left out. The chips filter on the folders
 *   in "Folders to filter recent notes on"; each note's type is shown as a
 *   pill, styled like in the link searches.
 * - "Switch to open tab" lists the open tabs, the most recently used first.
 *
 * The tab history (tabrecency.ts) is kept from the moment the plugin loads.
 * The GTD switcher in tasks/ uses it as well, to find the tab a note is in.
 *
 * Where the code is
 * -----------------
 * - outlinesearch.ts   the outline
 * - recentnotes.ts     recently created notes
 * - tabswitcher.ts     the tab switcher
 * - tabrecency.ts      the tab history
 * - settings.ts        the recent notes folders setting
 */

import type RonaldPlugin from '../main';
import { showOutline } from './outlinesearch';
import { showRecentNotes } from './recentnotes';
import type { TabRecency } from './tabrecency';
import { showTabSwitcher } from './tabswitcher';

/** Register the navigation features, listing tabs by `recency`. */
export function registerNavigation(plugin: RonaldPlugin, recency: TabRecency): void {
    plugin.addCommand({
        id: 'show-outline',
        name: 'Show outline of this note',
        icon: 'list',
        callback: () => showOutline(plugin.app),
    });

    // Like the link searches, the settings are read here rather than
    // captured, so a type or folder added in settings reaches the next run
    // without a reload.
    const recentNotes = () =>
        showRecentNotes(
            plugin.app,
            plugin.settings.linkNoteTypes,
            plugin.settings.recentFolders,
        );

    plugin.addCommand({
        id: 'show-recent-notes',
        name: 'Show recently created notes',
        icon: 'calendar-clock',
        callback: recentNotes,
    });

    plugin.addRibbonIcon('calendar-clock', 'Show recently created notes', recentNotes);

    plugin.addCommand({
        id: 'switch-to-open-tab',
        name: 'Switch to open tab',
        icon: 'panels-top-left',
        callback: () => showTabSwitcher(plugin.app, recency),
    });
}
