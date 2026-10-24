import type RonaldPlugin from '../main';
import { showOutline } from './outlinesearch';
import { showRecentNotes } from './recentnotes';
import type { TabRecency } from './tabrecency';
import { showTabSwitcher } from './tabswitcher';

/**
 * Getting around: the outline of the active note, recently created notes and
 * switching between open tabs, recent ones first by `recency`.
 */
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
