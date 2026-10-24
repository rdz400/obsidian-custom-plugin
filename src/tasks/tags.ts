import { App, Editor, Notice } from 'obsidian';

import { selectedLineRange } from '../shared/editor/lines';
import { collectTaskNotes } from '../shared/tasknotes';
import { TagSuggestModal } from '../shared/ui/modals';

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
        const tagRe = new RegExp(`(?<!\\w)#${tag}\\b`);
        for (let i = from; i <= to; i++) {
            const line = editor.getLine(i);
            if (!/^\s*[-*]\s/.test(line)) continue;
            if (tagRe.test(line)) {
                editor.setLine(i, line.replace(new RegExp(` ?#${tag}\\b ?`, 'g'), (m, offset, str: string) => {
                    if (offset === 0) return '';
                    if (offset + m.length === str.length) return '';
                    return ' ';
                }));
            } else {
                const separator = line.endsWith(' ') ? '' : ' ';
                editor.setLine(i, line + separator + `#${tag}`);
            }
        }
    }).open();
}

/** Matches an occurrence of `#tag`, not preceded by a word character. */
function tagPresence(tag: string): RegExp {
    return new RegExp(`(?<!\\w)#${tag}\\b`);
}

/**
 * The line with every `#tag` removed, collapsing the space it leaves behind so
 * no double space or trailing space remains.
 */
function stripTag(line: string, tag: string): string {
    const strip = new RegExp(` ?(?<!\\w)#${tag}\\b ?`, 'g');
    return line.replace(strip, (m, offset: number, str: string) => {
        if (offset === 0) return '';
        if (offset + m.length === str.length) return '';
        return ' ';
    });
}

/** Toggle a `#tag` on each selected list item. */
export function toggleTag(editor: Editor, tag: string): void {
    const present = tagPresence(tag);
    const { from, to } = selectedLineRange(editor);
    for (let i = from; i <= to; i++) {
        const line = editor.getLine(i);
        if (!/^\s*[-*]\s/.test(line)) continue;
        if (present.test(line)) {
            editor.setLine(i, stripTag(line, tag));
        } else {
            editor.setLine(i, line + ` #${tag}`);
        }
    }
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
    const present = tagPresence(tag);

    const files = collectTaskNotes(app, taskFolder);

    let notes = 0;
    let lines = 0;

    for (const file of files) {
        let changed = 0;
        await app.vault.process(file, (content) => {
            const result = content.split('\n').map((line) => {
                if (!/^\s*[-*]\s/.test(line)) return line;
                if (!present.test(line)) return line;
                changed++;
                return stripTag(line, tag);
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
