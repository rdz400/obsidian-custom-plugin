import { historyField, invertedEffects, isolateHistory, redo, undo } from '@codemirror/commands';
import { type Extension, StateEffect, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Editor, MarkdownView, Notice, TFile } from 'obsidian';

import { changedRange, replaceChanged } from '../shared/editor/lines';
import { textToAppend } from '../shared/vault';

/**
 * Undo and redo for moving lines to other notes.
 *
 * A move appends lines to one or more other notes, the targets, and takes them
 * out of the note they were in, the source. That is one step, wherever it is
 * undone: undo in the source puts the lines back there and takes them out of
 * the targets; undo in a target takes them out there and puts them back in
 * the source and out of the other targets. Redo, in any of them, moves them
 * again.
 *
 * Each note's edit carries a `Side` naming the move, so CodeMirror's history
 * keeps it with that note's undo step. A target open in an editor gets the
 * lines through that editor: written to the file instead, Obsidian would load
 * them into the editor as an edit of its own, which undo there would take out
 * without the source knowing.
 *
 * When the other notes are undone along, it is with their own undo where the
 * move is their last step, so their history stays in line. Otherwise their
 * text is edited outside the history: lines that can't go back where they were
 * go to the end of the source, never nowhere.
 */

/** The edit of one note in a move. */
interface Side {
    move: Move;
    file: TFile;
}

const moveDone = StateEffect.define<Side>();
const moveUndone = StateEffect.define<Side>();

/** One move of lines out of `source` and into the targets it is appended to. */
export class Move {
    private readonly targets: { file: TFile; text: string }[] = [];
    /** The editor each note was edited in, which holds the move's history step. */
    private readonly views = new Map<TFile, EditorView>();
    private before = '';
    private after = '';
    private lines = '';
    private finished = false;
    /** Whether the lines are out of the source, as after the move and a redo. */
    private out = true;

    constructor(
        private readonly app: App,
        private readonly source: TFile,
    ) {}

    /**
     * Add to the end of `file` what `added` gives for its content, and return
     * that text. Through the note's editor when it is open in one.
     */
    async append(file: TFile, added: (content: string) => string): Promise<string> {
        let text = '';
        const view = this.viewOf(file);
        if (view) {
            this.views.set(file, view);
            const content = view.state.doc.toString();
            text = added(content);
            view.dispatch({
                changes: { from: content.length, insert: text },
                effects: moveDone.of({ move: this, file }),
                annotations: isolateHistory.of('full'),
                userEvent: 'move',
            });
        } else {
            await this.app.vault.process(file, (content) => {
                text = added(content);
                return content + text;
            });
        }
        this.targets.push({ file, text });
        return text;
    }

    /**
     * Take the moved lines out of the source, open in `editor`, whose text
     * becomes `next`, in one edit. `lines` is the moved text, without what
     * was added around it in the targets, such as a heading.
     */
    finish(editor: Editor, next: string, lines: string): void {
        this.before = editor.getValue();
        this.after = next;
        this.lines = lines;
        this.finished = true;
        const view = cmOf(editor);
        if (!view) {
            replaceChanged(editor, next);
            return;
        }
        this.views.set(this.source, view);
        view.dispatch({
            changes: changedRange(this.before, next),
            effects: moveDone.of({ move: this, file: this.source }),
            annotations: isolateHistory.of('full'),
            userEvent: 'move',
        });
    }

    /** The move was undone in `file`: undo it in the other notes. */
    async undoneIn(file: TFile): Promise<void> {
        // A move given up halfway left the lines in the source; nothing to do.
        if (!this.finished || !this.out) return;
        this.out = false;
        const problems: string[] = [];
        if (file !== this.source && !this.historyStep(this.source, 'done')) {
            let atEnd = false;
            const found = await this.edit(this.source, (content) => {
                if (content === this.after) return this.before;
                atEnd = true;
                return content + textToAppend(content, this.lines);
            });
            if (!found) problems.push(`${this.source.basename} is gone`);
            else if (atEnd) problems.push(`put back at the end of ${this.source.basename}`);
        }
        for (const target of this.targets) {
            if (target.file === file || this.historyStep(target.file, 'done')) continue;
            let found = false;
            await this.edit(target.file, (content) => {
                const at = content.lastIndexOf(target.text);
                found = at >= 0;
                return found ? content.slice(0, at) + content.slice(at + target.text.length) : content;
            });
            if (!found) problems.push(`not found in ${target.file.basename}, so left there too`);
        }
        notify(`Moved the lines back to ${this.source.basename}`, problems);
    }

    /** The move was redone in `file`: redo it in the other notes. */
    async redoneIn(file: TFile): Promise<void> {
        if (!this.finished || this.out) return;
        this.out = true;
        const problems: string[] = [];
        if (file !== this.source && !this.historyStep(this.source, 'undone')) {
            let changed = false;
            await this.edit(this.source, (content) => {
                changed = content !== this.before;
                return changed ? content : this.after;
            });
            if (changed) problems.push(`${this.source.basename} changed, so left there too`);
        }
        for (const target of this.targets) {
            if (target.file === file || this.historyStep(target.file, 'undone')) continue;
            const found = await this.edit(target.file, (content) => {
                const gap = content.length > 0 && !content.endsWith('\n') && !target.text.startsWith('\n');
                return content + (gap ? '\n' : '') + target.text;
            });
            if (!found) problems.push(`${target.file.basename} is gone`);
        }
        const names = this.targets.map((target) => target.file.basename).join(', ');
        notify(`Moved the lines to ${names} again`, problems);
    }

    /**
     * Undo (`done`) or redo (`undone`) this move in `file` with its editor's
     * own history, when it is open and the move is its last step there.
     */
    private historyStep(file: TFile, branch: 'done' | 'undone'): boolean {
        const view = this.viewOf(file);
        if (!view || !lastStepIs(view, branch, this)) return false;
        if (branch === 'done') undo(view);
        else redo(view);
        return true;
    }

    /**
     * Change `file`'s text with `change`, outside the history: in its editor
     * when it is open in one, else on disk. False when the note is gone.
     */
    private async edit(file: TFile, change: (content: string) => string): Promise<boolean> {
        const view = this.viewOf(file);
        if (view) {
            const content = view.state.doc.toString();
            const next = change(content);
            if (next !== content) {
                view.dispatch({
                    changes: changedRange(content, next),
                    annotations: Transaction.addToHistory.of(false),
                });
            }
            return true;
        }
        if (this.app.vault.getFileByPath(file.path) !== file) return false;
        await this.app.vault.process(file, change);
        return true;
    }

    /**
     * The editor `file` is open in, if any: the one the move edited it in,
     * while that still shows it. Obsidian keeps every editor of a note in
     * step, but only that one has the move in its history, and an edit made
     * in another reaches it as a step of its own.
     */
    private viewOf(file: TFile): EditorView | undefined {
        const views = editorViewsOf(this.app, file);
        const moved = this.views.get(file);
        return views.find((view) => view === moved) ?? views[0];
    }
}

/** The editor extension that acts on undo and redo of a move, in any note. */
export function undoableMoves(): Extension {
    return [
        // History stores the opposite of each effect with the undo step, and
        // dispatches it on undo; on redo the opposite of that.
        invertedEffects.of((tr) =>
            tr.effects.flatMap((effect) => {
                if (effect.is(moveDone)) return [moveUndone.of(effect.value)];
                if (effect.is(moveUndone)) return [moveDone.of(effect.value)];
                return [];
            }),
        ),
        EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) {
                for (const effect of tr.effects) {
                    // The other notes are edited after this update, not during it.
                    if (effect.is(moveUndone) && tr.isUserEvent('undo')) {
                        const { move, file } = effect.value;
                        queueMicrotask(() => void move.undoneIn(file));
                    } else if (effect.is(moveDone) && tr.isUserEvent('redo')) {
                        const { move, file } = effect.value;
                        queueMicrotask(() => void move.redoneIn(file));
                    }
                }
            }
        }),
    ];
}

/** CodeMirror's history entry, which it doesn't export: the part read here. */
interface HistoryEvent {
    changes?: unknown;
    effects: readonly StateEffect<unknown>[];
}

/** Whether the last undo (`done`) or redo (`undone`) step in `view` is `move`'s. */
function lastStepIs(view: EditorView, branch: 'done' | 'undone', move: Move): boolean {
    const history = view.state.field(historyField, false) as
        | { done: HistoryEvent[]; undone: HistoryEvent[] }
        | undefined;
    const events = history?.[branch];
    const last = events?.[events.length - 1];
    if (!last?.changes) return false;
    return last.effects.some(
        (effect) => (effect.is(moveDone) || effect.is(moveUndone)) && effect.value.move === move,
    );
}

/** The CodeMirror view inside Obsidian's editor, which it doesn't document. */
function cmOf(editor: Editor): EditorView | undefined {
    return (editor as unknown as { cm?: EditorView }).cm;
}

/** Every editor `file` is open in. */
function editorViewsOf(app: App, file: TFile): EditorView[] {
    const views: EditorView[] = [];
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.file !== file) continue;
        const cm = cmOf(view.editor);
        if (cm) views.push(cm);
    }
    return views;
}

function notify(message: string, problems: string[]): void {
    new Notice(problems.length === 0 ? message : `${message}; ${problems.join('; ')}`);
}
