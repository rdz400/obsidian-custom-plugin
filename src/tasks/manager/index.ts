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
 * - "Manage tasks" (also a ribbon icon) opens it.
 * - Filters: the tag chips (Mod+1…9, all must match), the GTD note chips
 *   (Alt+1…4, any may match), Done (D) to show finished tasks and Top-level
 *   (L) to show only top-level tasks. They look at where tasks end up.
 * - Select with a tap or click, Shift+click for a range, or the keyboard:
 *   ↑/↓, Home/End, Space, Shift+↑/↓, Mod+A; Escape clears the selection.
 * - Change the selection with the buttons at the bottom or their keys: a tag
 *   button per filter tag (1…9), Move to today, someday, overview, inbox
 *   (T, S, O, I), Finish or Reopen (X). Mod+Z undoes the last action,
 *   Discard drops every change.
 *
 * Where the code is
 * -----------------
 * - load.ts        reading the task notes and their tasks
 * - draft.ts       the staged changes: each task's end state and the history
 * - model.ts       end states, filters, the grouped tree, counts and button states
 * - selection.ts   selection, focus and range anchor
 * - plan.ts        the new text of every note an apply changes
 * - modal.ts       the modal: layout, filters, keyboard
 * - listview.ts    the list of groups and rows
 * - actionbar.ts   the bar of buttons at the bottom
 * - testtasks.ts   for the tests: task notes from their text
 */

import type RonaldPlugin from '../../main';
import type { TaskSettings } from '../settings';
import { loadTasks } from './load';
import { TaskManagerModal } from './modal';

/** Read the task notes and open the task manager on them. */
async function manageTasks(plugin: RonaldPlugin, settings: TaskSettings): Promise<void> {
    const data = await loadTasks(plugin.app, settings);
    const chips = settings.taskFilterTags.filter((chip) => chip.value.length > 0);
    new TaskManagerModal(plugin.app, data, chips).open();
}

/** Register "Manage tasks" and its ribbon icon. */
export function registerTaskManager(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'manage-tasks',
        name: 'Manage tasks',
        icon: 'clipboard-list',
        callback: () => void manageTasks(plugin, plugin.settings),
    });
    plugin.addRibbonIcon('clipboard-list', 'Manage tasks', () => void manageTasks(plugin, plugin.settings));
}
