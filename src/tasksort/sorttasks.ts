import { App, Editor, Notice, TFile } from 'obsidian';

import { restoreCursor } from '../editor/editorcommands';
import { freshCache } from '../editor/freshcache';
import { reorderTasks, type SortTags } from './reorder';
import { TagPickerModal } from './tagpickermodal';

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
    new Notice(`Moved ${result.moved} tagged task(s)`);
}

/**
 * Ask which of the top tags to move, then move only the tasks with those to
 * the top, in the order they have in the note: the order of the tags in
 * settings doesn't apply here.
 *
 * Every configured tag still takes part in deciding, so a task's last tag picks
 * its place exactly as in the full sort: `#prio #misschien` stays put when only
 * `prio` is picked. Tags that weren't picked just leave their tasks in place.
 */
export function moveTasksToTop(app: App, file: TFile, editor: Editor, tags: SortTags): void {
    const choices = tags.top.filter((tag) => tag.length > 0);
    if (choices.length === 0) {
        new Notice('No tags to sort to the top in settings');
        return;
    }

    new TagPickerModal(app, choices, (picked) => {
        void sortTasksByTag(app, file, editor, {
            top: picked,
            bottom: [],
            keep: [...tags.top, ...tags.bottom],
            ranked: false,
        });
    }).open();
}
