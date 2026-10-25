import { App, Editor, ListItemCache, Notice, TFile } from 'obsidian';

import { restoreCursor, selectedLineRange } from '../shared/editor/lines';
import { freshCache } from '../shared/editor/freshcache';
import { appendToNote } from '../shared/vault';
import type RonaldPlugin from '../main';
import type { TaskSettings } from './settings';
import { removeMoved } from './undomove';

/**
 * The GTD notes lines can be sent to, each with its own command. `key` holds
 * the note's path in settings, `tagKey` the tag of the tasks that belong there.
 */
export const GTD_NOTES = [
    { id: 'today', name: 'today', key: 'todayNote', tagKey: 'todayTag' },
    { id: 'someday', name: 'someday', key: 'somedayNote', tagKey: 'somedayTag' },
    { id: 'overview', name: 'overview', key: 'overviewNote', tagKey: 'overviewTag' },
    { id: 'inbox', name: 'inbox', key: 'inboxNote', tagKey: 'inboxTag' },
] as const satisfies readonly {
    id: string;
    name: string;
    key: keyof TaskSettings;
    tagKey: keyof TaskSettings;
}[];

/** One of the GTD notes: today, someday, overview or inbox. */
export type GtdNote = (typeof GTD_NOTES)[number];

/** The GTD note `file` is set as in settings, if any. */
export function gtdNoteOf(file: TFile, settings: TaskSettings): GtdNote | undefined {
    return GTD_NOTES.find((note) => settings[note.key] === file.path);
}

/**
 * One "Move line(s) to …" command per GTD note.
 *
 * The note is looked up each time the command palette asks, so pointing a
 * command at another note in settings needs no reload. A command is hidden
 * when its note isn't set or doesn't exist, and in that note itself.
 */
export function registerGtdNoteCommands(plugin: RonaldPlugin): void {
    for (const note of GTD_NOTES) {
        plugin.addCommand({
            id: `move-lines-to-${note.id}`,
            name: `Move line(s) to ${note.name}`,
            icon: 'file-output',
            editorCheckCallback: (checking, editor, ctx) => {
                const target = plugin.app.vault.getFileByPath(plugin.settings[note.key]);
                if (!ctx.file || !target || target === ctx.file) return false;
                if (!checking) void moveLinesWithSubtasks(plugin.app, ctx.file, editor, target);
                return true;
            },
        });
    }
}

/**
 * The lines to move: those of every list item touching [from, to], and of
 * every item below one of those. Other lines — paragraphs, headings, blank
 * lines, even blank lines between a task and its subtasks — are left out.
 *
 * A child's `parent` is the line its parent starts on, and parents come first,
 * so one pass tells for every item whether an ancestor was taken.
 */
export function listItemLines(
    items: ListItemCache[],
    from: number,
    to: number,
): { lines: Set<number>; roots: Set<number> } {
    const starts = new Set<number>();
    const roots = new Set<number>();
    const lines = new Set<number>();
    for (const item of items) {
        const { start, end } = item.position;
        const touched = start.line <= to && end.line >= from;
        if (!touched && !starts.has(item.parent)) continue;
        starts.add(start.line);
        if (!starts.has(item.parent)) roots.add(start.line);
        for (let i = start.line; i <= end.line; i++) lines.add(i);
    }
    return { lines, roots };
}

const indentOf = (line: string) => /^[ \t]*/.exec(line)![0];

/**
 * `taken` with every root outdented to no indentation, its subtree along with
 * it: a subtask moved without its parent would otherwise land under whatever
 * task ends the target note. `roots` are the indexes in `taken` of the moved
 * items whose parent isn't moved; a root's subtree runs up to the next root.
 */
export function outdent(taken: string[], roots: Set<number>): string[] {
    let prefix = '';
    return taken.map((line, i) => {
        if (roots.has(i)) prefix = indentOf(line);
        if (line.startsWith(prefix)) return line.slice(prefix.length);
        // Indented differently (tabs against spaces): drop what whitespace there is.
        return line.slice(Math.min(indentOf(line).length, prefix.length));
    });
}

/**
 * `lines` without the ones in `moved`. A run taken out from between two blank
 * lines takes one of them along, so no double gap is left behind.
 */
function withoutLines(lines: string[], moved: Set<number>): string[] {
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!moved.has(i)) {
            kept.push(lines[i]!);
            continue;
        }
        while (moved.has(i + 1)) i++;
        const before = kept[kept.length - 1];
        const after = lines[i + 1];
        if (before?.trim() === '' && after?.trim() === '') i++;
    }
    return kept;
}

/**
 * Move the list items touched by the selection, with their subtasks, to the
 * end of `target`; other selected lines stay.
 *
 * The lines are added to `target` before they are taken out of `file`, so a
 * failure in between leaves them in both notes rather than in neither.
 */
async function moveLinesWithSubtasks(
    app: App,
    file: TFile,
    editor: Editor,
    target: TFile,
): Promise<void> {
    // Taken before waiting, so moving the cursor meanwhile doesn't change what moves.
    const { from, to } = selectedLineRange(editor);
    const origin = editor.getCursor('from');

    // The line numbers below are removed from the editor, so they must come
    // from a cache of what the editor shows, not of an older save.
    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }

    const { lines: moved, roots } = listItemLines(cache.listItems ?? [], from, to);
    if (moved.size === 0) {
        new Notice('No bullets or tasks selected');
        return;
    }
    const lines = text.split('\n');
    const indexes = [...moved].sort((a, b) => a - b);
    const taken = outdent(
        indexes.map((i) => lines[i]!),
        new Set(indexes.flatMap((line, i) => (roots.has(line) ? [i] : []))),
    );

    const added = await appendToNote(app, target, taken.join('\n'));

    // Edits while writing would shift the lines; they are in the target already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied to ${target.basename} but left here too`);
        return;
    }
    // One replacement, so a single undo puts every line back, and takes them
    // out of the target again.
    removeMoved(editor, withoutLines(lines, moved).join('\n'), [{ file: target, text: added }]);
    restoreCursor(editor, origin);
    new Notice(`Moved to ${target.basename}`);
}
