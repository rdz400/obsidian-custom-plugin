import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import {
    extendSelectionByLine,
    moveLinesToEnd,
    moveLinesToNote,
    moveLinesToTop,
    selectLine,
} from './linecommands';

/** Line editing: selecting whole lines and moving them within or out of a note. */
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
