import { App, Editor, Notice, TFile } from 'obsidian';

import { restoreCursor } from '../editor/editorcommands';
import { freshCache } from '../editor/freshcache';
import { reorderTasks, type SortTags } from './reorder';

/**
 * Replace only the stretch of the note that differs from `next`, so text
 * around it (and whatever the editor tracks there, like folds) is left alone.
 */
function replaceChanged(editor: Editor, next: string): void {
    const current = editor.getValue();
    const max = Math.min(current.length, next.length);

    let start = 0;
    while (start < max && current[start] === next[start]) start++;

    let end = 0;
    while (
        end < max - start &&
        current[current.length - 1 - end] === next[next.length - 1 - end]
    ) {
        end++;
    }

    editor.replaceRange(
        next.slice(start, next.length - end),
        editor.offsetToPos(start),
        editor.offsetToPos(current.length - end),
    );
}

/** Sort the top-level task hierarchies of `file`, open in `editor`, by their tags. */
export async function sortTasksByTag(
    app: App,
    file: TFile,
    editor: Editor,
    tags: SortTags,
): Promise<void> {
    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    // Typing while the cache caught up makes its line numbers stale again.
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while sorting; try again');
        return;
    }

    const result = reorderTasks(text, cache, tags);
    if (result.text === text) {
        new Notice('Tasks are already in order');
        return;
    }

    const origin = editor.getCursor('from');
    replaceChanged(editor, result.text);
    restoreCursor(editor, origin);
    new Notice(`Sorted ${result.moved} tagged task(s)`);
}
