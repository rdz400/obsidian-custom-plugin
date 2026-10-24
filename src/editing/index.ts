/**
 * Editing
 * =======
 *
 * Working with whole lines: selecting them and moving them, within a note or
 * to another one. These commands are meant to be bound to hotkeys.
 *
 * How to use it
 * -------------
 * - "Select whole line" selects the line the cursor is on, or widens a
 *   selection to whole lines.
 * - "Extend selection to line above" / "… below" selects the current line
 *   first, then adds one line at a time.
 * - "Move line(s) to top of file" moves the selected lines to the top: just
 *   below the frontmatter, with one blank line between.
 * - "Move line(s) to end of file" moves them to the end.
 * - "Move line(s) to another note" asks for a note and moves them to its end.
 *
 * A selection that ends at the very start of a line doesn't include that
 * line. Moves within a note are a single undo step, and the cursor stays
 * where it was.
 *
 * The line helpers these commands use are in shared/editor/lines.ts, because
 * the task commands use them too.
 *
 * Where the code is
 * -----------------
 * - linecommands.ts   all the commands above
 */

import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import {
    extendSelectionByLine,
    moveLinesToEnd,
    moveLinesToNote,
    moveLinesToTop,
    selectLine,
} from './linecommands';

/** Register the line editing commands. */
export function registerEditingCommands(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'move-lines-to-end',
        name: 'Move line(s) to end of file',
        icon: 'chevrons-down',
        editorCallback: (editor: Editor) => moveLinesToEnd(editor),
    });

    plugin.addCommand({
        id: 'select-line',
        name: 'Select whole line',
        icon: 'text-cursor-input',
        editorCallback: (editor: Editor) => selectLine(editor),
    });

    plugin.addCommand({
        id: 'extend-selection-line-up',
        name: 'Extend selection to line above',
        icon: 'chevron-up',
        editorCallback: (editor: Editor) => extendSelectionByLine(editor, -1),
    });

    plugin.addCommand({
        id: 'extend-selection-line-down',
        name: 'Extend selection to line below',
        icon: 'chevron-down',
        editorCallback: (editor: Editor) => extendSelectionByLine(editor, 1),
    });

    plugin.addCommand({
        id: 'move-lines-to-top',
        name: 'Move line(s) to top of file',
        icon: 'chevrons-up',
        editorCallback: (editor: Editor) => moveLinesToTop(editor),
    });

    plugin.addCommand({
        id: 'move-lines-to-note',
        name: 'Move line(s) to another note',
        icon: 'file-output',
        editorCallback: (editor: Editor) => moveLinesToNote(plugin.app, editor),
    });
}
