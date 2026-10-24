import { Editor, EditorChange, EditorPosition } from 'obsidian';

/**
 * Line helpers for editor commands: which lines a selection covers, and
 * taking lines out of or putting them back into a note.
 */

/** Position at the start of `line`. */
export function lineStart(line: number): EditorPosition {
    return { line, ch: 0 };
}

/** Position at the end of `line`. */
export function lineEnd(editor: Editor, line: number): EditorPosition {
    return { line, ch: editor.getLine(line).length };
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
export function restoreCursor(editor: Editor, at: EditorPosition): void {
    const line = Math.min(at.line, editor.lastLine());
    const ch = Math.min(at.ch, editor.getLine(line).length);
    editor.setSelection({ line, ch });
}

/**
 * Replace only the stretch of the note that differs from `next`, so text
 * around it (and whatever the editor tracks there, like folds) is left alone.
 */
export function replaceChanged(editor: Editor, next: string): void {
    const current = editor.getValue();
    const max = Math.min(current.length, next.length);

    let start = 0;
    while (start < max && current[start] === next[start]) start++;

    let end = 0;
    while (
        end < max - start &&
        current[current.length - 1 - end] === next[next.length - 1 - end]
    ) {
        end++;
    }

    editor.replaceRange(
        next.slice(start, next.length - end),
        editor.offsetToPos(start),
        editor.offsetToPos(current.length - end),
    );
}
