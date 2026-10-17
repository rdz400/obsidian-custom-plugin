import { App, Editor, Notice, TFile } from 'obsidian';

import { replaceChanged, restoreCursor } from '../editor/editorcommands';
import { freshCache } from '../editor/freshcache';
import { appendToNote } from '../vault';
import { takeTagged } from './reorder';

/**
 * Move the top-level tasks in `file` tagged `tag`, with their subtasks, to the
 * end of the note named after the tag.
 *
 * The tasks are added there before they are taken out of `file`.
 */
export async function moveTasksToTagNote(
    app: App,
    file: TFile,
    editor: Editor,
    tag: string,
): Promise<void> {
    const note = app.vault.getMarkdownFiles().find((f) => f.basename === tag);
    if (!note) {
        new Notice(`Note "${tag}" not found`);
        return;
    }
    if (note === file) {
        new Notice(`Cannot move tasks from "${tag}" into itself`);
        return;
    }

    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }

    const result = takeTagged(text, cache, tag);
    if (result.moved === 0) {
        new Notice(`No tasks with #${tag} in this note`);
        return;
    }

    await appendToNote(app, note, result.taken);

    // Edits while writing would be overwritten; the tasks are in their note already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied ${result.moved} task(s) to ${tag} but left them here too`);
        return;
    }
    const origin = editor.getCursor('from');
    replaceChanged(editor, result.text);
    restoreCursor(editor, origin);
    new Notice(`Moved ${result.moved} task(s) to ${tag}`);
}
