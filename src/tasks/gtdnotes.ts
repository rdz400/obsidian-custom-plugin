import { App, Editor, Notice, TFile } from 'obsidian';

import { restoreCursor, selectedLineRange } from '../shared/editor/lines';
import { freshCache } from '../shared/editor/freshcache';
import { textToAppend } from '../shared/vault';
import type RonaldPlugin from '../main';
import { listItemLines, outdent, withoutLines } from './listblocks';
import type { TaskSettings } from './settings';
import { Move } from './undomove';

/**
 * The GTD notes lines can be sent to, each with its own command. `key` holds
 * the note's path in settings, `tagKey` the tag of the tasks that belong there,
 * `icon` the Lucide icon of its command, `letter` the key that picks it in
 * "Switch to GTD note" and, with Alt, in "New task"; all on the home row.
 */
export const GTD_NOTES = [
    { id: 'today', name: 'today', key: 'todayNote', tagKey: 'todayTag', icon: 'sun', letter: 'a' },
    { id: 'someday', name: 'someday', key: 'somedayNote', tagKey: 'somedayTag', icon: 'hourglass', letter: 's' },
    { id: 'overview', name: 'overview', key: 'overviewNote', tagKey: 'overviewTag', icon: 'list-tree', letter: 'd' },
    { id: 'inbox', name: 'inbox', key: 'inboxNote', tagKey: 'inboxTag', icon: 'inbox', letter: 'f' },
] as const satisfies readonly {
    id: string;
    name: string;
    key: keyof TaskSettings;
    tagKey: keyof TaskSettings;
    icon: string;
    letter: string;
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
            icon: note.icon,
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

    const move = new Move(app, file);
    await move.append(target, (content) => textToAppend(content, taken.join('\n')));

    // Edits while writing would shift the lines; they are in the target already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied to ${target.basename} but left here too`);
        return;
    }
    // One replacement, so a single undo, here or in the target, puts every
    // line back and takes them out of the target again.
    move.finish(editor, withoutLines(lines, moved).join('\n'), taken.join('\n'));
    restoreCursor(editor, origin);
    new Notice(`Moved to ${target.basename}`);
}
