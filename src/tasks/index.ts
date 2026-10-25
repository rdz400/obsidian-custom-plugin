/**
 * Tasks
 * =====
 *
 * Tasks are checkbox lines ("- [ ] Bel Jan") in task notes: the notes directly
 * in the task folder (setting "Task notes folder", 1-taken by default). Notes
 * in a subfolder don't count, so a subfolder can serve as an archive. A task
 * can have subtasks indented below it; a task with its subtasks moves as one.
 *
 * Four task notes have a GTD role, set in settings each with a tag:
 * today (#vandaag), someday (#misschien), overview and inbox.
 *
 * How to use it
 * -------------
 * Finding tasks
 * - "Search tasks" (also a ribbon icon) lists every task in the task notes.
 *   The chips under the search field filter on the tags in "Task filter
 *   tags" (Mod+1…Mod+9); a task must carry every tag switched on. The chips
 *   in the row below filter on the GTD note a task is in (Alt+1…Alt+4); with
 *   more than one on, a task can be in any of them. A letter shows which note
 *   a task is in: T, S, O, I for the GTD notes. Ticking a checkbox writes
 *   straight to the note; Enter opens the task's line, Mod+Enter in a new tab.
 * - obsidian://ronald-tasks?query=bel&tags=prio,vandaag&notes=today,inbox&done=true
 *   opens the same search from a link; every parameter is optional.
 *
 * Getting to the notes
 * - "Switch to GTD note" (Mod+1…Mod+4 inside it) and "Open inbox" go to the
 *   tab already showing the note, or open it.
 * - "Open taken" opens every task note in its own tab.
 *
 * Tagging
 * - "Toggle #prio tag" (and #misschien, #vandaag, #week) toggles the tag on the
 *   selected list items; "Insert tag at end of line" asks which one, from
 *   "Tags to insert at end of line".
 * - "Remove #tag from all task notes" exists for each tag in "Tags to clear
 *   from task notes", for example to clear #vandaag at the end of the day.
 *   Changing that list needs a plugin reload.
 *
 * Managing tasks
 * - "Manage tasks" (also a ribbon icon) lists every task grouped by note, to
 *   select many and toggle their tags, move them to a GTD note or finish
 *   them. Changes are staged until Apply; see manager/index.ts.
 *
 * Moving tasks
 * - "Move line(s) to today" (and someday, overview, inbox) sends the selected
 *   list items, with their subtasks, to the end of that GTD note.
 * - "Move tagged tasks to their GTD notes" (in a task note) sends every
 *   top-level task with a GTD tag to that tag's note.
 * - "Move tasks with a tag to top" (in a task note) asks for a tag and puts
 *   the tasks with it at the top of the note.
 * - "Move finished tasks to klaar" moves finished tasks whose subtasks are
 *   all finished too to the end of the note "klaar", under a heading linking
 *   today's daily note. "Open klaar" opens that note.
 * - Undo after any of these moves, except "to top", puts the tasks back and
 *   takes them out of the note they went to again; redo moves them again.
 *
 * In the editor
 * - "Toggle checkbox status advanced" cycles a line through
 *   [ ] → [x] → [o] → [-] → plain bullet.
 * - A backslash and minutes at the end of a task's text is an estimate:
 *   "- [ ] Bel Jan \20 #thuis". In task notes it is coloured, and the status
 *   bar adds up the estimates of the open tasks. The status bar also counts
 *   the tasks in any note.
 *
 * Renaming the task folder or a GTD note updates the settings to match.
 *
 * Where the code is
 * -----------------
 * - settings.ts       the task settings and their part of the settings tab
 * - tasknotes.ts      task note badges, reading their tasks, keeping settings right
 *                     on rename, "Open taken"
 * - taskitems.ts      a task as the search shows it, and edits to its line
 * - search.ts         the task search
 * - gtdnotes.ts       the GTD notes and "Move line(s) to …"
 * - listblocks.ts     taking list items out with their subitems, for "Move line(s) to …"
 * - gtdswitcher.ts    "Switch to GTD note" and "Open inbox"
 * - movetonotes.ts    "Move tagged tasks to their GTD notes"
 * - sorttasks.ts      "Move tasks with a tag to top"
 * - reorder.ts        finding top-level tasks with their subtasks, for both of the above
 * - tags.ts           the tag commands
 * - taglines.ts       finding, adding and removing a tag on a line, for those
 * - klaar.ts          the "klaar" note
 * - undomove.ts       undo and redo of a move in the note it went to
 * - checkbox.ts       the checkbox cycle
 * - estimate/         time estimates
 * - manager/          the task manager
 * - taskcount.ts      the task count in the status bar
 * - urihandler.ts     obsidian://ronald-tasks
 *
 * Telling a task line, finding the task notes and reading their list items
 * with the tags and links they inherit live in shared/, because the project
 * search counts open tasks too. So do the tab history and the tab
 * helpers the GTD switcher uses, which the tab switcher in navigation/ shares.
 */

import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import { isTaskNote } from '../shared/tasknotes';
import type { TabRecency } from '../shared/tabrecency';
import { toggleCheckBoxAdvanced } from './checkbox';
import { registerEstimates } from './estimate';
import { registerGtdNoteCommands } from './gtdnotes';
import { registerTaskManager } from './manager';
import { goToGtdNote, showGtdSwitcher } from './gtdswitcher';
import { moveFinishedTasksToKlaar, openKlaar } from './klaar';
import { moveTasksToGtdNotes } from './movetonotes';
import { searchTasks } from './search';
import { moveTasksToTop } from './sorttasks';
import { insertTag, removeTagFromTaskNotes, toggleTag } from './tags';
import { registerTaskCount } from './taskcount';
import { openTaskNotes, registerTaskNoteRenames } from './tasknotes';
import { undoableMoves } from './undomove';
import { registerTasksUriHandler } from './urihandler';

/**
 * Register the task features. `recency` is the plugin's tab history, which the
 * GTD switcher and "Open inbox" use to find a tab already showing the note.
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

    for (const tag of ['prio', 'misschien', 'vandaag', 'week']) {
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
    plugin.registerEditorExtension(undoableMoves(plugin.app));

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
    registerTaskManager(plugin);
}
