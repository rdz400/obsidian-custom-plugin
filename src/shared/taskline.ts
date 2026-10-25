import type { ListItemCache } from 'obsidian';

import { addMissing, linksOnLine, tagsOnLine } from './markdown';

/** A checkbox list line: the list marker, then the checkbox with its marker. */
const TASK_LINE_RE = /^(\s*[-*+]\s+)\[([^\]])\]\s?/;

/** The checkbox marker of a task line ("x" for "- [x] Foo"), or undefined for any other line. */
export function taskMarker(line: string): string | undefined {
    return TASK_LINE_RE.exec(line)?.[2];
}

/** Whether a checkbox marker means the task is finished. */
export function isDoneMarker(marker: string): boolean {
    return marker === 'x' || marker === 'X';
}

/** One list item of a note, with what it carries from the items it hangs under. */
export interface ListLine {
    /** The line the item starts on. */
    line: number;
    /** That full source line. */
    raw: string;
    /** The checkbox marker, or undefined for a plain bullet. */
    marker: string | undefined;
    /** How deeply the item is nested: 1 for a top-level item, 2 under it, etc. */
    depth: number;
    /** Own tags first, then those inherited from ancestors. */
    tags: string[];
    /** Own links first, then those inherited from ancestors. */
    links: string[];
}

/**
 * Every list item of a note, tasks and plain bullets alike, in order.
 *
 * `listItems` is flat and ordered by position, with `parent` holding the start
 * line of the containing item (negative for a top-level item, where it encodes
 * the section instead). Since a parent always appears before its children, one
 * forward pass indexed by start line is enough to accumulate each line's own
 * tags and links on top of everything its ancestors carry — which is how a
 * subtask inherits the context of the bullet or task it hangs under, so a
 * subtask under "- [ ] Bel [[Tuin]]" belongs to Tuin even though its own line
 * names no project. The same pass counts the depth: one more than the depth of
 * the parent item, plain bullets included.
 */
export function listLines(items: ListItemCache[], lines: string[]): ListLine[] {
    const byLine = new Map<number, ListLine>();
    const result: ListLine[] = [];

    for (const item of items) {
        const line = item.position.start.line;
        const raw = lines[line];
        if (raw === undefined) continue;

        const parent = item.parent < 0 ? undefined : byLine.get(item.parent);
        const listLine: ListLine = {
            line,
            raw,
            marker: taskMarker(raw),
            depth: (parent?.depth ?? 0) + 1,
            tags: addMissing(tagsOnLine(raw), parent?.tags ?? []),
            links: addMissing(linksOnLine(raw), parent?.links ?? []),
        };
        byLine.set(line, listLine);
        result.push(listLine);
    }

    return result;
}
