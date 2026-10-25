import type { Plugin } from 'obsidian';

import type { TaskSettings } from './settings';
import { parseValues } from '../shared/uri';
import { searchTasks } from './search';

/** The protocol action that opens the task search modal. */
export const TASKS_URI_ACTION = 'ronald-tasks';

/** Parameters read by the task search action. */
interface TasksUriParams extends Record<string, string> {
    /** Text to put in the search field. */
    query: string;
    /** Comma-separated tag values to switch on, e.g. `tags=prio,vandaag`. */
    tags: string;
    /** Comma-separated GTD notes to switch on, e.g. `notes=today,inbox`. */
    notes: string;
    /** When `"true"`, include tasks that are already ticked off. */
    done: string;
}

/**
 * Register `obsidian://ronald-tasks` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the modal exactly as the
 * command does.
 *
 * The settings are read at call time rather than captured, so a tag added in
 * settings is available to the next link without a reload. `registerObsidianProtocolHandler` unregisters on unload, so nothing
 * extra is needed in `onunload`.
 */
export function registerTasksUriHandler(
    plugin: Plugin,
    settings: () => TaskSettings,
): void {
    plugin.registerObsidianProtocolHandler(TASKS_URI_ACTION, (params) => {
        const { query, tags, notes, done } = params as Partial<TasksUriParams>;

        void searchTasks(plugin.app, settings(), {
            query,
            activeTags: parseValues(tags),
            activeNotes: parseValues(notes),
            showDone: done === 'true',
        });
    });
}
