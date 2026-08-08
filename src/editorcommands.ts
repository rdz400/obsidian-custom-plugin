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

/** Move the selected line(s) to the top of the file, below the frontmatter. */
export function moveLinesToTop(editor: Editor): void {
    const { from, to } = selectedLineRange(editor);

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

    selectLines(editor, target, target + (to - from));
}
