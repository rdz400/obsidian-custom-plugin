import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import type { TabRecency } from '../tabs/tabrecency';
import { toggleCheckBoxAdvanced } from './checkbox';
import { registerEstimates } from './estimate';
import { registerGtdNoteCommands } from './gtdnotes';
import { goToGtdNote, showGtdSwitcher } from './gtdswitcher';
import { moveFinishedTasksToKlaar, openKlaar } from './klaar';
import { moveTasksToGtdNotes } from './movetonotes';
import { searchTasks } from './search';
import { moveTasksToTop } from './sorttasks';
import { insertTag, removeTagFromTaskNotes, toggleTag } from './tags';
import { registerTaskCount } from './taskcount';
import { isTaskNote, openTaskNotes, registerTaskNoteRenames } from './tasknotes';
import { registerTasksUriHandler } from './urihandler';

/**
 * Everything for tasks: opening, searching, tagging and moving them, the GTD
 * notes, and the task count and estimates in the status bar.
 *
 * `recency` is the plugin's tab history, which the GTD switcher and "Open
 * inbox" use to find a tab already showing the note.
 */
export function registerTaskFeatures(plugin: RonaldPlugin, recency: TabRecency): void {
    plugin.addCommand({
        id: 'open-klaar',
        name: 'Open klaar',
        icon: 'check-check',
        callback: () => openKlaar(plugin.app),
    });

    // The inbox is the GTD note set in settings, opened the way the GTD
    // switcher opens it, so both always land on the same note.
    const openInbox = () => goToGtdNote(plugin.app, plugin.settings, recency, 'inbox');

    plugin.addCommand({
        id: 'open-inbox',
        name: 'Open inbox',
        icon: 'inbox',
        callback: () => void openInbox(),
    });

    plugin.addRibbonIcon('check-check', 'Open klaar', () => openKlaar(plugin.app));
    plugin.addRibbonIcon('inbox', 'Open inbox', () => void openInbox());

    plugin.addCommand({
        id: 'open-taken',
        name: 'Open taken',
        icon: 'list-checks',
        callback: () => openTaskNotes(plugin.app, plugin.settings.taskFolder),
    });

    for (const tag of ['nu', 'misschien', 'vandaag', 'week']) {
        plugin.addCommand({
            id: `toggle-${tag}-tag`,
            name: `Toggle #${tag} tag`,
            icon: 'hash',
            editorCallback: (editor: Editor) => toggleTag(editor, tag),
        });
    }

    // One command per tag rather than one command that asks which tag: this
    // way each can carry its own hotkey. Reading the list at load means an
    // added tag needs a reload, which the setting's description says.
    for (const tag of plugin.settings.clearTags) {
        if (tag.length === 0) continue;
        plugin.addCommand({
            id: `remove-${tag}-tag-from-taken-notes`,
            name: `Remove #${tag} tag from all task notes`,
            icon: 'eraser',
            callback: () =>
                void removeTagFromTaskNotes(plugin.app, plugin.settings.taskFolder, tag),
        });
    }

    plugin.addCommand({
        id: 'move-tagged-tasks-to-top',
        name: 'Move tasks with a tag to top',
        icon: 'arrow-up-to-line',
        // Only offered in task notes.
        editorCheckCallback: (checking, editor, ctx) => {
            if (!ctx.file || !isTaskNote(ctx.file, plugin.settings.taskFolder)) return false;
            if (!checking) void moveTasksToTop(plugin.app, ctx.file, editor);
            return true;
        },
    });

    plugin.addCommand({
        id: 'move-tagged-tasks-to-gtd-notes',
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- GTD is an acronym
        name: 'Move tagged tasks to their GTD notes',
        icon: 'file-output',
        // Only offered in task notes.
        editorCheckCallback: (checking, editor, ctx) => {
            if (!ctx.file || !isTaskNote(ctx.file, plugin.settings.taskFolder)) return false;
            if (!checking) void moveTasksToGtdNotes(plugin.app, plugin.settings, ctx.file, editor);
            return true;
        },
    });

    registerGtdNoteCommands(plugin);
    registerTaskNoteRenames(plugin);

    plugin.addCommand({
        id: 'toggle-checkbox-advanced',
        name: 'Toggle checkbox status advanced',
        icon: 'square-check-big',
        editorCallback: (editor: Editor) => toggleCheckBoxAdvanced(editor),
    });

    plugin.addCommand({
        id: 'move-finished-tasks-to-klaar',
        name: 'Move finished tasks to "klaar"',
        icon: 'check-check',
        callback: () => moveFinishedTasksToKlaar(plugin.app),
    });

    plugin.addCommand({
        id: 'insert-tag',
        name: 'Insert tag at end of line',
        icon: 'tag',
        editorCallback: (editor: Editor) =>
            insertTag(plugin.app, editor, plugin.settings.insertTags),
    });

    // The settings are read when the search opens rather than captured, so a
    // tag added in settings reaches the next search without a reload.
    plugin.addCommand({
        id: 'search-tasks',
        name: 'Search tasks',
        icon: 'list-checks',
        callback: () => void searchTasks(plugin.app, plugin.settings),
    });

    plugin.addRibbonIcon('list-checks', 'Search tasks', () =>
        void searchTasks(plugin.app, plugin.settings),
    );

    plugin.addCommand({
        id: 'switch-to-gtd-note',
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- GTD is an acronym
        name: 'Switch to GTD note',
        icon: 'list-todo',
        callback: () => showGtdSwitcher(plugin.app, plugin.settings, recency),
    });

    registerTasksUriHandler(plugin, () => plugin.settings);

    registerTaskCount(plugin);
    registerEstimates(plugin);
}
