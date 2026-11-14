import type { TFile } from 'obsidian';

import type RonaldPlugin from '../../main';
import { newTask, type NewTaskPreset } from './modal';
import { registerNewTaskUriHandler } from './urihandler';

/**
 * "New task" (also a ribbon icon) and obsidian://ronald-new-task: a modal
 * that adds a task to the end of a GTD note, with tags, a project link and an
 * estimate. See the overview in `tasks/index.ts`.
 *
 * `projects` lists the projects a task can link to. The tasks feature doesn't
 * know what makes a project active, so main.ts passes it in from projects/;
 * without it the modal has no project field.
 *
 * The settings are read when the modal opens, so a tag or GTD note changed in
 * settings needs no reload.
 *
 * - modal.ts           the modal, and `newTask` that opens it
 * - taskline.ts        the task line it writes, and reading its fields
 * - findproject.ts     the project a typed name stands for
 * - projectsuggest.ts  the suggestions under the project field
 * - addtask.ts         writing the line to the GTD note
 * - urihandler.ts      obsidian://ronald-new-task
 */
export function registerNewTask(plugin: RonaldPlugin, projects?: () => TFile[]): void {
    const open = (preset?: NewTaskPreset) =>
        newTask(plugin.app, plugin.settings, projects, preset);

    plugin.addCommand({
        id: 'new-task',
        name: 'New task',
        icon: 'list-plus',
        callback: () => open(),
    });

    plugin.addRibbonIcon('list-plus', 'New task', () => open());

    registerNewTaskUriHandler(plugin, open);
}
