import { App, Editor, Notice } from 'obsidian';

import { selectedLineRange } from '../shared/editor/lines';
import { collectTaskNotes } from '../shared/tasknotes';
import { TagSuggestModal } from '../shared/ui/modals';
import { addTag, hasOwnTag, removeTag } from './taglines';

/** A list item's line: a bullet or a task. */
const LIST_ITEM_RE = /^\s*[-*]\s/;

/** Toggle a `#tag` on each list item in lines [from, to]. */
function toggleTagOnLines(editor: Editor, tag: string, from: number, to: number): void {
    for (let i = from; i <= to; i++) {
        const line = editor.getLine(i);
        if (!LIST_ITEM_RE.test(line)) continue;
        editor.setLine(i, hasOwnTag(line, tag) ? removeTag(line, tag) : addTag(line, tag));
    }
}

/**
 * Open a modal to pick a tag and toggle it at the end of each selected list item.
 *
 * `tags` comes from the settings, where a row left blank would otherwise offer a
 * choice that tags nothing, so empty entries are dropped here.
 */
export function insertTag(app: App, editor: Editor, tags: string[]): void {
    const { from, to } = selectedLineRange(editor);
    const choices = tags.map((t) => t.trim()).filter((t) => t.length > 0);

    new TagSuggestModal(app, choices, (tag: string) => {
        toggleTagOnLines(editor, tag, from, to);
    }).open();
}

/** Toggle a `#tag` on each selected list item. */
export function toggleTag(editor: Editor, tag: string): void {
    const { from, to } = selectedLineRange(editor);
    toggleTagOnLines(editor, tag, from, to);
}

/**
 * Remove a `#tag` from every list item in every task note, the notes directly
 * in `taskFolder`.
 *
 * Only list items are touched, matching {@link toggleTag}: the tag is a marker
 * on a task, and an occurrence in prose or in frontmatter is not one.
 */
export async function removeTagFromTaskNotes(
    app: App,
    taskFolder: string,
    tag: string,
): Promise<void> {
    const files = collectTaskNotes(app, taskFolder);

    let notes = 0;
    let lines = 0;

    for (const file of files) {
        let changed = 0;
        await app.vault.process(file, (content) => {
            const result = content.split('\n').map((line) => {
                if (!LIST_ITEM_RE.test(line)) return line;
                if (!hasOwnTag(line, tag)) return line;
                changed++;
                return removeTag(line, tag);
            });
            return changed > 0 ? result.join('\n') : content;
        });
        if (changed > 0) {
            notes++;
            lines += changed;
        }
    }

    new Notice(
        notes === 0
            ? `No #${tag} tags found in ${taskFolder || 'task notes'}`
            : `Removed ${lines} #${tag} tag(s) from ${notes} note(s)`,
    );
}
