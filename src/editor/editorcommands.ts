import { Editor, EditorChange, EditorPosition, Notice } from 'obsidian';

/**
 * Editor conveniences: line selection and moving lines around.
 *
 * All selections produced here are "full line" selections: anchor at the start
 * of the first line, head at the end of the last line.
 */

/** Position at the start of `line`. */
function lineStart(line: number): EditorPosition {
    return { line, ch: 0 };
}

/** Position at the end of `line`. */
function lineEnd(editor: Editor, line: number): EditorPosition {
    return { line, ch: editor.getLine(line).length };
}

/** Select the lines [from, to] in full. */
function selectLines(editor: Editor, from: number, to: number): void {
    editor.setSelection(lineStart(from), lineEnd(editor, to));
}

/**
 * The line range the selection actually covers.
 *
 * A selection made with shift+Down or a triple-click ends at `ch: 0` of the
 * line *after* the last selected one. Counting that line would drag an
 * untouched line into the operation, so it is excluded (unless the selection is
 * empty, i.e. a bare cursor).
 *
 * On a blank line `ch: 0` is both the start and the end of that line, so the
 * two readings collide. Excluding it there would drop a line the selection
 * genuinely covers, so a blank end line is always kept.
 */
export function selectedLineRange(editor: Editor): { from: number; to: number } {
    const start = editor.getCursor('from');
    const end = editor.getCursor('to');
    const endsBeforeLine =
        end.ch === 0 && end.line > start.line && editor.getLine(end.line).length > 0;
    return { from: start.line, to: endsBeforeLine ? end.line - 1 : end.line };
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
 * First line of the body, i.e. the line after the frontmatter block (and any
 * blank lines following it). Returns 0 when the note has no frontmatter.
 */
function firstBodyLine(editor: Editor): number {
    if (editor.getLine(0).trim() !== '---') return 0;

    const last = editor.lastLine();
    for (let i = 1; i <= last; i++) {
        if (editor.getLine(i).trim() !== '---') continue;
        // Skip blank lines between the frontmatter and the body.
        let line = i + 1;
        while (line <= last && editor.getLine(line).trim() === '') line++;
        return line;
    }

    // Unterminated `---`: treat the whole note as body.
    return 0;
}

/**
 * The edit that deletes lines [from, to], including a surrounding newline so no
 * blank line is left behind.
 *
 * Returned rather than applied so callers can combine it with another edit in a
 * single {@link Editor.transaction} — two separate `replaceRange` calls can end
 * up as two undo steps, which makes one undo revert only half of a move.
 */
export function removalChange(editor: Editor, from: number, to: number): EditorChange {
    if (from === 0 && to < editor.lastLine()) {
        // Leading lines: also drop the newline after them.
        return {
            from: { line: from, ch: 0 },
            to: { line: to + 1, ch: 0 },
            text: '',
        };
    }
    if (from > 0) {
        // Non-leading lines: also drop the newline before them.
        return {
            from: { line: from - 1, ch: editor.getLine(from - 1).length },
            to: { line: to, ch: editor.getLine(to).length },
            text: '',
        };
    }
    // The selection is the whole document.
    return {
        from: { line: 0, ch: 0 },
        to: { line: to, ch: editor.getLine(to).length },
        text: '',
    };
}

/** Remove the lines [from.line, to.line] from the editor, including a surrounding newline. */
export function removeLines(editor: Editor, from: number, to: number): void {
    const change = removalChange(editor, from, to);
    editor.replaceRange(change.text, change.from, change.to);
}

/** Return the text of the currently selected lines (full lines, not partial selections). */
export function getSelectedLinesText(editor: Editor): string {
    const { from, to } = selectedLineRange(editor);
    return editor.getRange(
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length },
    );
}

/**
 * Put the cursor back where it was, by line number, after a move.
 *
 * Both move commands keep the document's line count the same, so holding the
 * cursor at its original line leaves the view exactly where it was instead of
 * scrolling along with the moved text. The line can still fall off the end
 * (moving a block down shifts the lines below it up), so clamp it, and clamp
 * the column to the length of whatever line it lands on.
 */
function restoreCursor(editor: Editor, at: EditorPosition): void {
    const line = Math.min(at.line, editor.lastLine());
    const ch = Math.min(at.ch, editor.getLine(line).length);
    editor.setSelection({ line, ch });
}

/** Move the selected line(s) to the top of the file, below the frontmatter. */
export function moveLinesToTop(editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    const origin = editor.getCursor('from');

    const target = firstBodyLine(editor);
    if (from === target) return;
    if (from < target) {
        new Notice('Line(s) are inside the frontmatter');
        return;
    }

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
