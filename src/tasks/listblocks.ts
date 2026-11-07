import type { ListItemCache } from 'obsidian';

/**
 * Taking list items out of a note with their subitems, as moving tasks to
 * another note does.
 */

/**
 * The lines to move: those of every list item touching [from, to], and of
 * every item below one of those. Other lines — paragraphs, headings, blank
 * lines, even blank lines between a task and its subtasks — are left out.
 *
 * A child's `parent` is the line its parent starts on, and parents come first,
 * so one pass tells for every item whether an ancestor was taken.
 */
export function listItemLines(
    items: ListItemCache[],
    from: number,
    to: number,
): { lines: Set<number>; roots: Set<number> } {
    const starts = new Set<number>();
    const roots = new Set<number>();
    const lines = new Set<number>();
    for (const item of items) {
        const { start, end } = item.position;
        const touched = start.line <= to && end.line >= from;
        if (!touched && !starts.has(item.parent)) continue;
        starts.add(start.line);
        if (!starts.has(item.parent)) roots.add(start.line);
        for (let i = start.line; i <= end.line; i++) lines.add(i);
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
