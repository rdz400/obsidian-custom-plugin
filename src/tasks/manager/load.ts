import type { App } from 'obsidian';

import { readTaskNoteLines, type TaskNoteLines } from '../../shared/tasknotes';
import { GTD_NOTES } from '../gtdnotes';
import type { TaskSettings } from '../settings';
import type { TaskItem } from '../taskitems';
import { tasksOfNotes } from '../tasknotes';
import type { GtdId } from './draft';
import type { GtdTarget } from './model';

/** What the task manager works on: the notes as read, and the tasks in them. */
export interface ManagerData {
    /**
     * Every task note with list items, and every GTD note tasks can be moved
     * to, with no list items when it has none: each with the text everything
     * is planned against.
     */
    notes: TaskNoteLines[];
    tasks: TaskItem[];
    /** The GTD notes that are set and exist, in GTD order. */
    gtd: GtdTarget[];
    /** Their paths, by id. */
    targets: Map<GtdId, string>;
}

/** Read the task notes and their tasks, as the manager does when it opens. */
export async function loadTasks(app: App, settings: TaskSettings): Promise<ManagerData> {
    const notes = await readTaskNoteLines(app, settings.taskFolder);
    const gtd: GtdTarget[] = [];
    for (const { id, name, key } of GTD_NOTES) {
        const file = app.vault.getFileByPath(settings[key]);
        if (!file) continue;
        gtd.push({ id, name, path: file.path });
        if (!notes.some((note) => note.file === file)) {
            notes.push({ file, text: await app.vault.cachedRead(file), lines: [] });
        }
    }
    return {
        notes,
        tasks: tasksOfNotes(notes, settings),
        gtd,
        targets: new Map(gtd.map(({ id, path }) => [id, path])),
    };
}
