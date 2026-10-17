import { App, Editor, Notice, TFile } from 'obsidian';

import { restoreCursor } from '../editor/editorcommands';
import { freshCache } from '../editor/freshcache';
import { TagSuggestModal } from '../ui/modals';
import { moveTaggedToTop, topLevelTaskTags } from './reorder';

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

/** Pick a tag on a top-level task in `file`, then move the tasks with it to the top. */
export async function moveTasksToTop(app: App, file: TFile, editor: Editor): Promise<void> {
    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    const tags = cache ? topLevelTaskTags(cache) : [];
    if (!cache || tags.length === 0) {
        new Notice('No tagged tasks in this note');
        return;
    }

    new TagSuggestModal(app, tags, (tag) => {
        // Edits since the cache was built make its line numbers stale.
        if (editor.getValue() !== text) {
            new Notice('Note changed while moving; try again');
            return;
        }
        const origin = editor.getCursor('from');
        replaceChanged(editor, moveTaggedToTop(text, cache, tag));
        restoreCursor(editor, origin);
    }).open();
}
