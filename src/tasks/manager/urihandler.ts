import type { Plugin } from 'obsidian';

import { parseValues } from '../../shared/uri';
import type { ManagerPreset } from './modal';

/** The protocol action that opens the task manager. */
export const TASK_MANAGER_URI_ACTION = 'ronald-task-manager';

/** Parameters read by the task manager action. */
interface TaskManagerUriParams extends Record<string, string> {
    /** Comma-separated tag values to switch on, e.g. `tags=prio,vandaag`. */
    tags: string;
    /** Comma-separated GTD notes to switch on, e.g. `notes=today,inbox`. */
    notes: string;
    /** When `"true"`, switch on the Done chip. */
    done: string;
    /** When `"true"`, switch on the Top-level chip. */
    toplevel: string;
}

/**
 * Register `obsidian://ronald-task-manager` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the manager exactly as the
 * command does. `open` reads the settings when it runs, so a tag added in
 * settings works in the next link without a reload.
 */
export function registerTaskManagerUriHandler(
    plugin: Plugin,
    open: (preset: ManagerPreset) => void,
): void {
    plugin.registerObsidianProtocolHandler(TASK_MANAGER_URI_ACTION, (params) => {
        const { tags, notes, done, toplevel } = params as Partial<TaskManagerUriParams>;

        open({
            tags: parseValues(tags),
            notes: parseValues(notes),
            done: done === 'true',
            topLevel: toplevel === 'true',
        });
    });
}
