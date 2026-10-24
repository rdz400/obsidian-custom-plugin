import { App, Notice, TAbstractFile, TFile } from 'obsidian';

import { GTD_NOTES } from './gtdnotes';
import type RonaldPlugin from '../main';
import type { RonaldSettings } from '../settings';

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

/** How a task note is marked next to its tasks in the task search. */
export interface TaskNoteBadge {
    /** One letter: the GTD role's capital, or the note name's first letter in lowercase. */
    letter: string;
    /** The full name, for the tooltip. */
    label: string;
}

/**
 * The badge for `file`. A GTD note is marked by its role rather than its file
 * name, so today, someday, overview and inbox always read as T, S, O and I
 * whatever the notes are called. Any other task note gets its own first
 * letter in lowercase, which keeps it from passing for one of those four.
 */
export function taskNoteBadge(file: TFile, settings: RonaldSettings): TaskNoteBadge {
    const gtd = GTD_NOTES.find((note) => settings[note.key] === file.path);
    if (gtd) {
        return {
            letter: gtd.name.charAt(0).toUpperCase(),
            label: gtd.name === file.basename ? gtd.name : `${gtd.name} (${file.basename})`,
        };
    }
    // Spread so a name starting with an emoji or other surrogate pair keeps it whole.
    const first = [...file.basename][0] ?? '?';
    return { letter: first.toLowerCase(), label: file.basename };
}

/** `path` after a rename of `oldPath` to `newPath`, which may be a parent of it. */
function renamedPath(path: string, oldPath: string, newPath: string): string {
    if (path === oldPath) return newPath;
    if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
    return path;
}

/**
 * Keep the task folder and the GTD notes in settings pointing at the right
 * place when they are renamed or moved, and warn when a GTD note leaves the
 * task folder, since its tasks then drop out of the task search.
 *
 * Renaming a folder fires one event for the folder and one per file in it;
 * the prefix match in `renamedPath` lets the folder's event carry its notes
 * along, whichever comes first.
 */
export function registerTaskNoteRenames(plugin: RonaldPlugin): void {
    plugin.registerEvent(
        plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
            const { settings } = plugin;
            let changed = false;

            const taskFolder = renamedPath(settings.taskFolder, oldPath, file.path);
            if (taskFolder !== settings.taskFolder) {
                settings.taskFolder = taskFolder;
                changed = true;
            }

            for (const note of GTD_NOTES) {
                const path = renamedPath(settings[note.key], oldPath, file.path);
                if (path === settings[note.key]) continue;
                settings[note.key] = path;
                changed = true;

                // Only a note that left a task folder still standing warns: when
                // the folder itself is being renamed, this note's event may come
                // before the folder's, while the setting still has the old name.
                const folderStands =
                    plugin.app.vault.getFolderByPath(settings.taskFolder) !== null;
                if (file instanceof TFile && folderStands && !isTaskNote(file, settings.taskFolder)) {
                    new Notice(
                        `"${note.name}" note moved out of ${settings.taskFolder}; ` +
                            'its tasks no longer show in Search tasks',
                    );
                }
            }

            if (changed) void plugin.saveSettings();
        }),
    );
}

/** Open all task notes in new tabs. */
export async function openTaskNotes(app: App, taskFolder: string): Promise<void> {
    const files = collectTaskNotes(app, taskFolder);

    for (const file of files) {
        const leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(file);
    }
}
