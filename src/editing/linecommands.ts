import { App, Editor, EditorChange, Notice, TFile } from 'obsidian';

import {
    getSelectedLinesText,
    lineEnd,
    lineStart,
    removalChange,
    removeLines,
    restoreCursor,
    selectedLineRange,
} from '../shared/editor/lines';
import { NoteSuggestModal } from '../shared/ui/modals';
import { appendToNote } from '../shared/vault';

/**
 * Editor conveniences: line selection and moving lines around.
 *
 * All selections produced here are "full line" selections: anchor at the start
 * of the first line, head at the end of the last line.
 */

/** Select the lines [from, to] in full. */
function selectLines(editor: Editor, from: number, to: number): void {
    editor.setSelection(lineStart(from), lineEnd(editor, to));
}

/**
 * Whether the current selection already covers lines [from, to] completely.
 *
 * A bare cursor on a blank line sits at `ch: 0`, which is simultaneously the
 * start and the end of that line, so it would otherwise look like a complete
 * selection of it. Requiring a non-empty selection keeps the first keypress
 * selecting the line rather than extending past it.
 */
function coversWholeLines(editor: Editor, from: number, to: number): boolean {
    const start = editor.getCursor('from');
    const end = editor.getCursor('to');
    if (start.line === end.line && start.ch === end.ch) return false;
    return (
        start.line === from &&
        start.ch === 0 &&
        end.line === to &&
        end.ch === editor.getLine(to).length
    );
}

/** Select the whole line the cursor is on, or expand a selection to whole lines. */
export function selectLine(editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    selectLines(editor, from, to);
}

/**
 * Extend the selection by one whole line up or down.
 *
 * With no selection (or a partial one), the current line is selected in full
 * first, so the first invocation always selects the current line and the next
 * one adds its neighbour.
 */
export function extendSelectionByLine(editor: Editor, direction: -1 | 1): void {
    let { from, to } = selectedLineRange(editor);

    // First press on a bare cursor or partial selection: just take the line(s).
    // Blank lines are the exception: selecting one "in full" spans no
    // characters, so the selection would stay empty and every further press
    // would repeat this same step. Fall through and extend instead.
    const isBlankSingleLine = from === to && editor.getLine(from).length === 0;
    if (!coversWholeLines(editor, from, to) && !isBlankSingleLine) {
        selectLines(editor, from, to);
        return;
    }

    if (direction === -1) {
        if (from === 0) return;
        from -= 1;
    } else {
        if (to === editor.lastLine()) return;
        to += 1;
    }

    selectLines(editor, from, to);
}

/**
 * The line the frontmatter's closing `---` is on, or `null` when the note has
 * no (terminated) frontmatter.
 */
function frontmatterEndLine(editor: Editor): number | null {
    if (editor.getLine(0).trim() !== '---') return null;

    const last = editor.lastLine();
    for (let i = 1; i <= last; i++) {
        if (editor.getLine(i).trim() === '---') return i;
    }

    // Unterminated `---`: treat the whole note as body.
    return null;
}

/**
 * The line moved text belongs on: two lines below the frontmatter's closing
 * `---`, so exactly one blank line separates the two, or 0 when the note has no
 * frontmatter.
 *
 * The offset is fixed rather than "the first non-blank line": blank lines
 * already sitting under the frontmatter must not push the target down to where
 * the existing content starts.
 *
 * The target line only exists once that blank line does, so a note that has
 * none is given one first — which is why this needs an editor it may write to.
 */
function firstBodyLine(editor: Editor): number {
    const end = frontmatterEndLine(editor);
    if (end === null) return 0;

    // No blank line under the frontmatter yet (or the note stops there): add
    // one, so the moved text never ends up directly against the `---`.
    if (editor.getLine(end + 1).trim() !== '' || end + 1 > editor.lastLine()) {
        const at = lineEnd(editor, end);
        editor.replaceRange('\n', at, at);
    }

    return end + 2;
}


/**
 * Move the selected line(s) to the top of the note: one blank line below the
 * frontmatter, or the very first line when there is none.
 */
export function moveLinesToTop(editor: Editor): void {
    const selection = selectedLineRange(editor);
    const origin = editor.getCursor('from');

    // Rejected before the note is touched, so a selection in the frontmatter
    // leaves it exactly as it was.
    const end = frontmatterEndLine(editor);
    if (end !== null && selection.from <= end) {
        new Notice('Line(s) are inside the frontmatter');
        return;
    }

    const linesBefore = editor.lastLine();
    const target = firstBodyLine(editor);
    // A blank line added under the frontmatter sits above the selection, so
    // everything below it — the selection included — shifted down one line.
    const shift = editor.lastLine() - linesBefore;
    const from = selection.from + shift;
    const to = selection.to + shift;

    if (from === target) return;
    // The blank line the frontmatter is followed by is not a line to move from.
    if (from < target) return;

    const text = editor.getRange(lineStart(from), lineEnd(editor, to));

    // The removal drops a surrounding newline so no blank line is left behind:
    // the one after the block, or — when the block ends the note — the one
    // before it.
    const removal: EditorChange =
        to < editor.lastLine()
            ? { from: lineStart(from), to: lineStart(to + 1), text: '' }
            : {
                  from: lineEnd(editor, from - 1),
                  to: lineEnd(editor, to),
                  text: '',
              };

    // Both changes are applied as one transaction so a single undo reverts the
    // whole move. Their positions are relative to the document as it is now, so
    // the removal does not shift the insertion point.
    editor.transaction({
        changes: [
            removal,
            { from: lineStart(target), to: lineStart(target), text: text + '\n' },
        ],
    });

    restoreCursor(editor, origin);
}

/** Move the selected lines to the end of the document. */
export function moveLinesToEnd(editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    const origin = editor.getCursor('from');
    const text = getSelectedLinesText(editor);

    const lastLine = editor.lastLine();
    if (to >= lastLine) return; // Already at the end.

    // Append after the last line that has content, so a trailing empty line
    // (notes usually end with a newline) doesn't become a blank gap above the
    // moved text — and isn't consumed either.
    const endsEmpty = editor.getLine(lastLine).length === 0;
    const anchor = endsEmpty ? lastLine - 1 : lastLine;
    const anchorEnd = { line: anchor, ch: editor.getLine(anchor).length };

    // Both changes are applied as one transaction so a single undo reverts the
    // whole move. Their positions are relative to the document as it is now,
    // not to the result of the other change.
    editor.transaction({
        changes: [
            removalChange(editor, from, to),
            { from: anchorEnd, to: anchorEnd, text: '\n' + text },
        ],
    });

    restoreCursor(editor, origin);
}

/** Move the selected lines to a chosen note via a fuzzy-search modal. */
export function moveLinesToNote(app: App, editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    const text = getSelectedLinesText(editor);

    new NoteSuggestModal(app, async (file: TFile) => {
        await appendToNote(app, file, text);
        removeLines(editor, from, to);

        new Notice(`Moved to ${file.basename}`);
    }).open();
}
