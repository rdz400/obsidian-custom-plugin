import type { Editor } from 'obsidian';

/** Cycles a list item through checkbox states: `[ ] → [x] → [o] → [-] → plain`. */
export function toggleCheckbox(line: string): string {
    const states = ['[ ]', '[x]', '[o]', '[-]'];
    const checkboxMatch = line.match(/^(\s*[-*+]\s+)\[(.)\](\s+.*)?$/);

    if (checkboxMatch) {
        const prefix = checkboxMatch[1];
        const marker = checkboxMatch[2];
        const rest = checkboxMatch[3] ?? '';
        const current = `[${marker}]`;
        const idx = states.indexOf(current);

        if (idx >= 0) {
            return `${prefix}${states[(idx + 1) % states.length]}${rest}`;
        }
        return `${prefix}${states[0]}${rest}`;
    }

    const listMatch = line.match(/^(\s*[-*+]\s+)(.*)?$/);
    if (listMatch) {
        return `${listMatch[1]}[ ] ${listMatch[2] ?? ''}`;
    }

    return line;
}

/** Cycle the checkbox state of the current line, preserving the cursor/selection position. */
export function toggleCheckBoxAdvanced(editor: Editor): void {
    const cursor = editor.getCursor();
    const anchor = editor.getCursor('anchor');
    const line = editor.getLine(cursor.line);
    const toggled = toggleCheckbox(line);
    const delta = toggled.length - line.length;
    editor.setLine(cursor.line, toggled);

    if (cursor.line === anchor.line && cursor.ch !== anchor.ch) {
        const newCursor = { line: cursor.line, ch: Math.max(0, cursor.ch + delta) };
        const newAnchor = { line: anchor.line, ch: Math.max(0, anchor.ch + delta) };
        editor.setSelection(newAnchor, newCursor);
    } else {
        const distFromEnd = line.length - cursor.ch;
        editor.setCursor({ line: cursor.line, ch: Math.max(0, toggled.length - distFromEnd) });
    }
}
