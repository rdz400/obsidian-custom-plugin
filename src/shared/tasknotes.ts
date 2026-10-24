import { App, TFile } from 'obsidian';

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
