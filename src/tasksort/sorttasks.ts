import { App, Editor, Notice, TFile } from 'obsidian';

import { replaceChanged, restoreCursor } from '../editor/editorcommands';
import { freshCache } from '../editor/freshcache';
import { TagSuggestModal } from '../ui/modals';
import { moveTaggedToTop, topLevelTaskTags } from './reorder';

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
        const result = moveTaggedToTop(text, cache, tag);
        const origin = editor.getCursor('from');
        replaceChanged(editor, result.text);
        restoreCursor(editor, origin);
        new Notice(`Moved ${result.moved} task(s) with #${tag} to top`);
    }).open();
}
