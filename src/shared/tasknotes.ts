import { App, TFile } from 'obsidian';

import { type ListLine, listLines } from './taskline';

/**
 * Whether `file` is a task note: a note directly in the task folder. Notes in
 * a subfolder don't count, so a subfolder can serve as an archive. Nothing is a
 * task note while the folder isn't set.
 */
export function isTaskNote(file: TFile, taskFolder: string): boolean {
    return (
        taskFolder.length > 0 &&
        file.extension === 'md' &&
        file.parent?.path === taskFolder
    );
}

/** The task notes, read from the folder itself rather than a vault scan. */
export function collectTaskNotes(app: App, taskFolder: string): TFile[] {
    if (taskFolder.length === 0) return [];
    const folder = app.vault.getFolderByPath(taskFolder);
    if (!folder) return [];
    return folder.children.filter(
        (child): child is TFile => child instanceof TFile && isTaskNote(child, taskFolder),
    );
}

/** A task note with its list items, see `listLines`. */
export interface TaskNoteLines {
    file: TFile;
    /** The note's text the lines were read from. */
    text: string;
    lines: ListLine[];
}

/**
 * The list items of every task note, for the task search and the project
 * task counts. Notes without list items are left out without being read.
 */
export async function readTaskNoteLines(app: App, taskFolder: string): Promise<TaskNoteLines[]> {
    const notes: TaskNoteLines[] = [];
    for (const file of collectTaskNotes(app, taskFolder)) {
        const items = app.metadataCache.getFileCache(file)?.listItems ?? [];
        if (items.length === 0) continue;

        const text = await app.vault.cachedRead(file);
        notes.push({ file, text, lines: listLines(items, text.split('\n')) });
    }
    return notes;
}
