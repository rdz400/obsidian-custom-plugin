/**
 * Task manager
 * ============
 *
 * A large modal listing every task in the task notes, grouped by note as a
 * tree, to select many tasks and change them at once: toggle tags, move them
 * to a GTD note, finish or reopen them. Changes are staged: the list shows
 * where they lead straight away, and nothing is written until Apply.
 *
 * How to use it
 * -------------
 * - "Manage tasks" (also a ribbon icon) opens it, and so does
 *   obsidian://ronald-task-manager, which can switch filters on as it opens:
 *   `tags=prio,vandaag`, `notes=today,inbox`, `done=true`, `toplevel=true`.
 * - Filters: the tag chips (Mod+1…9, all must match), the GTD note chips
 *   (Alt+1…4, any may match), Done (D) to show finished tasks and Top-level
 *   (L) to show only top-level tasks. They look at where tasks end up.
 * - Select with a tap or click, Shift+click for a range, or the keyboard:
 *   ↑/↓, Home/End, Space, Shift+↑/↓, Mod+A; Escape clears the selection.
 * - Change the selection with the buttons at the bottom or their keys: a tag
 *   button per filter tag (1…9), Move to today, someday, overview, inbox
 *   (T, S, O, I), Finish or Reopen (X). Mod+Z undoes the last action,
 *   Discard drops every change.
 * - Apply (Mod+Enter) writes the changes, each note once, and reads the
 *   notes again; the manager stays open with nothing pending or selected,
 *   so Escape closes it. A notice says what was applied; a note changed
 *   since the manager read it keeps its own changes, and the notice says so.
 *   Closing while it writes lets the writes finish; opening the manager
 *   again waits for them.
 * - Closing with changes pending asks whether to apply them first.
 * - On a phone it fills the screen; the chips share one row, and the tag
 *   and move buttons show only while something is selected.
 *
 * Where the code is
 * -----------------
 * - load.ts        reading the task notes and their tasks
 * - draft.ts       the staged changes: each task's end state and the history
 * - model.ts       end states, filters, the grouped tree, counts and button states
 * - selection.ts   selection, focus and range anchor
 * - plan.ts        the new text of every note an apply changes
 * - apply.ts       writing the plan
 * - modal.ts       the modal: layout, filters, apply, closing
 * - keys.ts        its keyboard
 * - confirm.ts     "Apply n changes?" when closing
 * - listview.ts    the list of groups and rows
 * - actionbar.ts   the bar of buttons at the bottom
 * - urihandler.ts  obsidian://ronald-task-manager
 * - testtasks.ts   for the tests: task notes from their text
 */

import type RonaldPlugin from '../../main';
import type { TaskSettings } from '../settings';
import { appliesDone } from './apply';
import { loadTasks } from './load';
import { type ManagerPreset, TaskManagerModal } from './modal';
import { registerTaskManagerUriHandler } from './urihandler';

/** Read the task notes and open the task manager on them, with `preset` filters on. */
async function manageTasks(plugin: RonaldPlugin, settings: TaskSettings, preset?: ManagerPreset): Promise<void> {
    // An apply still writing would otherwise be read half done.
    await appliesDone();
    const data = await loadTasks(plugin.app, settings);
    const chips = settings.taskFilterTags.filter((chip) => chip.value.length > 0);
    // The settings as they are now, for reading the notes again after an apply.
    const reload = () => loadTasks(plugin.app, settings);
    new TaskManagerModal(plugin.app, data, chips, reload, preset).open();
}

/** Register "Manage tasks", its ribbon icon and its URI. */
export function registerTaskManager(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'manage-tasks',
        name: 'Manage tasks',
        icon: 'clipboard-list',
        callback: () => void manageTasks(plugin, plugin.settings),
    });
    plugin.addRibbonIcon('clipboard-list', 'Manage tasks', () => void manageTasks(plugin, plugin.settings));
    registerTaskManagerUriHandler(plugin, (preset) => void manageTasks(plugin, plugin.settings, preset));
}
