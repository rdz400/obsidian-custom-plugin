import type { ListItemCache } from 'obsidian';

/**
 * Taking list items out of a note with their subitems, as moving tasks to
 * another note does.
 */

/**
 * Where a list item is in its note: the lines it starts and ends on (its own
 * text, without its subitems) and the line its parent starts on, undefined at
 * top level. The metadata cache's list items give these through `cacheSpans`,
 * a `ListLine` as `line`, `end` and `parent`.
 */
export interface ListSpan {
    start: number;
    end: number;
    parent: number | undefined;
}

/** The spans of the metadata cache's list items, in the same order. */
export function cacheSpans(items: readonly ListItemCache[]): ListSpan[] {
    return items.map(({ position, parent }) => ({
        start: position.start.line,
        end: position.end.line,
        parent: parent < 0 ? undefined : parent,
    }));
}

/**
 * The lines to move: those of every list item touching [from, to], and of
 * every item below one of those. Other lines — paragraphs, headings, blank
 * lines, even blank lines between a task and its subtasks — are left out.
 *
 * A child's `parent` is the line its parent starts on, and parents come first,
 * so one pass tells for every item whether an ancestor was taken.
 */
export function listItemLines(
    items: readonly ListSpan[],
    from: number,
    to: number,
): { lines: Set<number>; roots: Set<number> } {
    const starts = new Set<number>();
    const roots = new Set<number>();
    const lines = new Set<number>();
    for (const { start, end, parent } of items) {
        const touched = start <= to && end >= from;
        const parentTaken = parent !== undefined && starts.has(parent);
        if (!touched && !parentTaken) continue;
        starts.add(start);
        if (!parentTaken) roots.add(start);
        for (let i = start; i <= end; i++) lines.add(i);
    }
    return { lines, roots };
}

const indentOf = (line: string) => /^[ \t]*/.exec(line)![0];

/**
 * `taken` with every root outdented to no indentation, its subtree along with
 * it: a subtask moved without its parent would otherwise land under whatever
 * task ends the target note. `roots` are the indexes in `taken` of the moved
 * items whose parent isn't moved; a root's subtree runs up to the next root.
 */
export function outdent(taken: string[], roots: Set<number>): string[] {
    let prefix = '';
    return taken.map((line, i) => {
        if (roots.has(i)) prefix = indentOf(line);
        if (line.startsWith(prefix)) return line.slice(prefix.length);
        // Indented differently (tabs against spaces): drop what whitespace there is.
        return line.slice(Math.min(indentOf(line).length, prefix.length));
    });
}

/**
 * `lines` without the ones in `moved`. A run taken out from between two blank
 * lines takes one of them along, so no double gap is left behind.
 */
export function withoutLines(lines: string[], moved: Set<number>): string[] {
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!moved.has(i)) {
            kept.push(lines[i]!);
            continue;
        }
        while (moved.has(i + 1)) i++;
        const before = kept[kept.length - 1];
        const after = lines[i + 1];
        if (before?.trim() === '' && after?.trim() === '') i++;
    }
    return kept;
}
