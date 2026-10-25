import { invertedEffects } from '@codemirror/commands';
import { type Extension, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Editor, Notice, TFile } from 'obsidian';

import { changedRange, replaceChanged } from '../shared/editor/lines';

/**
 * Undo for moving lines to other notes. A move appends the lines to other
 * notes and takes them out of the editor, and the editor's own undo only puts
 * them back here. So the edit that takes them out carries what was appended
 * where, and CodeMirror's history keeps that with the undo step: undoing takes
 * the lines back out of those notes, redoing appends them again.
 */

/** Text a move appended to the end of a note. */
export interface Appended {
    file: TFile;
    text: string;
}

const movedOut = StateEffect.define<Appended[]>();
const movedBack = StateEffect.define<Appended[]>();

/** The editor extension that acts on undo and redo of a move. */
export function undoableMoves(app: App): Extension {
    return [
        // History stores the opposite of each effect with the undo step, and
        // dispatches it on undo; on redo the opposite of that.
        invertedEffects.of((tr) =>
            tr.effects.flatMap((effect) => {
                if (effect.is(movedOut)) return [movedBack.of(effect.value)];
                if (effect.is(movedBack)) return [movedOut.of(effect.value)];
                return [];
            }),
        ),
        EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) {
                for (const effect of tr.effects) {
                    if (effect.is(movedBack)) void takeBack(app, effect.value);
                    // The move itself appended already; only a redo appends again.
                    else if (effect.is(movedOut) && tr.isUserEvent('redo')) {
                        void appendAgain(app, effect.value);
                    }
                }
            }
        }),
    ];
}

/**
 * Change the editor's text to `next` in one edit that remembers `appended`,
 * so undoing it also takes that text out of its notes again.
 */
export function removeMoved(editor: Editor, next: string, appended: Appended[]): void {
    // Obsidian's editor wraps a CodeMirror view, which it doesn't document.
    const view = (editor as unknown as { cm?: EditorView }).cm;
    if (!view) {
        replaceChanged(editor, next);
        return;
    }
    view.dispatch({
        changes: changedRange(editor.getValue(), next),
        effects: movedOut.of(appended),
        // A user event the history doesn't join with the typing before it.
        userEvent: 'move',
    });
}

/**
 * Take each appended text out of its note again: the last copy, as the move
 * appended it. Text that was edited in the meantime is left alone, so it ends
 * up in both notes rather than something else getting removed.
 */
async function takeBack(app: App, appended: Appended[]): Promise<void> {
    const missing: string[] = [];
    for (const { file, text } of appended) {
        let found = false;
        if (app.vault.getFileByPath(file.path) === file) {
            await app.vault.process(file, (content) => {
                const at = content.lastIndexOf(text);
                found = at >= 0;
                return found ? content.slice(0, at) + content.slice(at + text.length) : content;
            });
        }
        if (!found) missing.push(file.basename);
    }
    const names = appended.map(({ file }) => file.basename).join(', ');
    new Notice(
        missing.length === 0
            ? `Took the moved lines back out of ${names}`
            : `Moved lines not found in ${missing.join(', ')}; they are in both notes now`,
    );
}

/** Append each text to its note again, after an undo was redone. */
async function appendAgain(app: App, appended: Appended[]): Promise<void> {
    for (const { file, text } of appended) {
        if (app.vault.getFileByPath(file.path) !== file) continue;
        await app.vault.process(file, (content) => {
            const gap = content.length > 0 && !content.endsWith('\n') && !text.startsWith('\n');
            return content + (gap ? '\n' : '') + text;
        });
    }
}
