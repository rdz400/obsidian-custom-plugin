import type { CachedMetadata } from 'obsidian';

import { listItemLines, outdent, withoutLines } from './listblocks';

/** The parts of the metadata cache read here; it must describe exactly the text. */
export type SectionCache = Pick<CachedMetadata, 'listItems' | 'headings'>;

/**
 * `text` with the list items touched by lines [from, to], with their subitems,
 * moved to the end of the section under the heading on line `heading`; other
 * selected lines stay. `undefined` when the selection touches no list item.
 *
 * The section ends at the next heading of any level, so a move to "## Werk"
 * never lands under its "### Later". The items go right below the section's
 * last line with text, so blank lines before the next heading stay where they
 * are, and right below the heading when the section has none. Like a move to
 * another note, a subtask moved without its parent is outdented to the top.
 */
export function moveUnderHeading(
    text: string,
    cache: SectionCache,
    from: number,
    to: number,
    heading: number,
): string | undefined {
    const { lines: moved, roots } = listItemLines(cache.listItems ?? [], from, to);
    if (moved.size === 0) return undefined;

    const lines = text.split('\n');
    const indexes = [...moved].sort((a, b) => a - b);
    const taken = outdent(
        indexes.map((i) => lines[i]!),
        new Set(indexes.flatMap((line, i) => (roots.has(line) ? [i] : []))),
    );

    const next = (cache.headings ?? [])
        .map((h) => h.position.start.line)
        .filter((line) => line > heading);
    const end = next.length > 0 ? Math.min(...next) : lines.length;
    let after = heading;
    for (let i = end - 1; i > heading; i--) {
        if (!moved.has(i) && lines[i]!.trim() !== '') {
            after = i;
            break;
        }
    }

    // Put the items in first, then take the originals out, so the removal can
    // close up gaps the way a move to another note does. `after` is a line
    // that stays, so the two never touch.
    const placed = [...lines.slice(0, after + 1), ...taken, ...lines.slice(after + 1)];
    const shifted = new Set(indexes.map((i) => (i > after ? i + taken.length : i)));
    return withoutLines(placed, shifted).join('\n');
}
