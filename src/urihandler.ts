import { Plugin } from 'obsidian';

import type { FilterChip } from './filterbar';
import { searchTasks } from './tasksearch';

/** The protocol action that opens the task search modal. */
export const TASKS_URI_ACTION = 'ronald-tasks';

/** Parameters read by the task search action. */
interface TasksUriParams extends Record<string, string> {
    /** Text to put in the search field. */
    query: string;
    /** Comma-separated tag values to switch on, e.g. `tags=nu,vandaag`. */
    tags: string;
    /** When `"true"`, include tasks that are already ticked off. */
    done: string;
}

/**
 * Split a comma-separated `tags` parameter into the values the filter bar uses.
 *
 * A hand-written link is likely to spell a tag the way it reads in a note, so a
 * leading "#" is accepted and capitals are folded away; the chips themselves are
 * lowercase and unprefixed.
 */
function parseTags(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
        .filter((tag) => tag.length > 0);
}

/**
 * Register `obsidian://ronald-tasks` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the modal exactly as the
 * command does.
 *
 * The chips come from the plugin settings and are read at call time rather than
 * captured, so a tag added in settings is available to the next link without a
 * reload. `registerObsidianProtocolHandler` unregisters on unload, so nothing
 * extra is needed in `onunload`.
 */
export function registerTasksUriHandler(
    plugin: Plugin,
    filterTags: () => readonly FilterChip[],
): void {
    plugin.registerObsidianProtocolHandler(TASKS_URI_ACTION, (params) => {
        const { query, tags, done } = params as Partial<TasksUriParams>;

        void searchTasks(plugin.app, filterTags(), {
            query,
            activeTags: parseTags(tags),
            showDone: done === 'true',
        });
    });
}
