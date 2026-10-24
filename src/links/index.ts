import type RonaldPlugin from '../main';
import { searchBacklinks } from './backlinksearch';
import { copyWikilink } from './copywikilink';
import { searchOutgoingLinks } from './outgoinglinksearch';

/** The link searches for the active note, and copying a link to it. */
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
