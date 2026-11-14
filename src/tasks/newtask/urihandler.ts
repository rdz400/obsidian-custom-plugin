import type { Plugin } from 'obsidian';

import { parseValues } from '../../shared/uri';
import { GTD_NOTES } from '../gtdnotes';
import type { NewTaskPreset } from './modal';

/** The protocol action that opens the "New task" modal. */
export const NEW_TASK_URI_ACTION = 'ronald-new-task';

/** Parameters read by the new task action. */
interface NewTaskUriParams extends Record<string, string> {
    /** The task's text. */
    text: string;
    /** The GTD note to add to: `today`, `someday`, `overview` or `inbox`. */
    note: string;
    /** Comma-separated tags, e.g. `tags=prio,werk`. */
    tags: string;
    /** The name of an active project to link to. */
    project: string;
    /** The estimate in minutes. */
    estimate: string;
}

/**
 * Register `obsidian://ronald-new-task` for the lifetime of the plugin.
 *
 * It always opens the modal, filled in with what the link gives, so the task
 * is looked at before it is added. Every parameter is optional; an unknown
 * `note` falls back to the inbox.
 */
export function registerNewTaskUriHandler(
    plugin: Plugin,
    open: (preset: NewTaskPreset) => void,
): void {
    plugin.registerObsidianProtocolHandler(NEW_TASK_URI_ACTION, (params) => {
        const { text, note, tags, project, estimate } = params as Partial<NewTaskUriParams>;
        const wanted = note?.trim().toLowerCase();
        open({
            text,
            note: GTD_NOTES.find((gtd) => gtd.id === wanted)?.id,
            tags: parseValues(tags),
            project,
            estimate,
        });
    });
}
