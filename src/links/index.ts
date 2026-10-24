/**
 * Links
 * =====
 *
 * Searching the links of the active note, in both directions, and copying a
 * link to it.
 *
 * How to use it
 * -------------
 * - "Search notes linking to this note" lists the notes that link here, the
 *   ones with the most links first. Enter opens a note at its first link here,
 *   Mod+Enter in a new tab.
 * - "Search links in this note" lists everywhere this note links to, each
 *   destination once: notes, web links, and links to notes that don't exist
 *   yet. Enter opens the destination (a web link in the browser), Mod+Enter
 *   in a new tab, and Alt+Enter jumps to where the link is written here.
 * - Both show each note's frontmatter `type` as a pill. The types in "Note
 *   types to filter links on" get an icon and a chip (Mod+1…Mod+9); all other
 *   types fall under the "overige" chip.
 * - "Copy wikilink to this note" copies [[…]] to the clipboard, whatever the
 *   vault's link format.
 *
 * Where the code is
 * -----------------
 * - backlinksearch.ts       notes linking to this note
 * - outgoinglinksearch.ts   links in this note
 * - copywikilink.ts         copying a wikilink
 * - settings.ts             the note types setting, also used for the pills in the recent notes list
 */

import type RonaldPlugin from '../main';
import { searchBacklinks } from './backlinksearch';
import { copyWikilink } from './copywikilink';
import { searchOutgoingLinks } from './outgoinglinksearch';

/** Register the link features. */
export function registerLinkFeatures(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'search-backlinks',
        name: 'Search notes linking to this note',
        icon: 'link',
        // The types come from the settings and are read here rather than
        // captured, so a type added in settings reaches the next search
        // without a reload.
        callback: () => searchBacklinks(plugin.app, plugin.settings.linkNoteTypes),
    });

    plugin.addCommand({
        id: 'search-outgoing-links',
        name: 'Search links in this note',
        icon: 'external-link',
        callback: () =>
            void searchOutgoingLinks(plugin.app, plugin.settings.linkNoteTypes),
    });

    plugin.addCommand({
        id: 'copy-wikilink-to-this-note',
        name: 'Copy wikilink to this note',
        icon: 'link-2',
        checkCallback: (checking) => {
            const file = plugin.app.workspace.getActiveFile();
            if (!file) return false;
            if (!checking) void copyWikilink(plugin.app, file);
            return true;
        },
    });
}
