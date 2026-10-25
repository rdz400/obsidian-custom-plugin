import { TAG_RE } from '../shared/markdown';

/**
 * Tags on a list item's own line: whether one is there, adding it, taking it
 * out.
 *
 * A tag is one exact name, so `#prio` is neither `#prio/x` nor `#prio-x`, and
 * case doesn't count, as in Obsidian and in `tagsOnLine`. A `#` right after a
 * letter or digit isn't a tag ("C#").
 */

/** Where `#tag` stands on `line`: the offsets of each `#` and just past the name. */
function tagRanges(line: string, tag: string): { from: number; to: number }[] {
    const wanted = tag.toLowerCase();
    const ranges: { from: number; to: number }[] = [];
    for (const match of line.matchAll(TAG_RE)) {
        if (match[1]?.toLowerCase() !== wanted) continue;
        if (/\w/.test(line.charAt(match.index - 1))) continue;
        ranges.push({ from: match.index, to: match.index + match[0].length });
    }
    return ranges;
}

/** Whether `#tag` is on `line` itself. */
export function hasOwnTag(line: string, tag: string): boolean {
    return tagRanges(line, tag).length > 0;
}

/** A block id ending a line, with the whitespace before it. */
const BLOCK_ID_RE = /\s+\^[\w-]+$/;

/**
 * `line` with ` #tag` at the end, unless it is there already.
 *
 * Trailing whitespace goes first, and a block id (`^abc`) stays last, since
 * Obsidian only reads it at the end of the line. An estimate (`\20`) may stay
 * before the tag: it is still read as one.
 */
export function addTag(line: string, tag: string): string {
    if (hasOwnTag(line, tag)) return line;
    const trimmed = line.trimEnd();
    const blockId = BLOCK_ID_RE.exec(trimmed);
    if (!blockId) return `${trimmed} #${tag}`;
    return `${trimmed.slice(0, blockId.index)} #${tag}${blockId[0]}`;
}

/**
 * `line` with every `#tag` taken out, other tags left in their order. Each one
 * goes with the space before it, or with none there the space after it, so no
 * double or trailing space is left.
 */
export function removeTag(line: string, tag: string): string {
    let result = line;
    // From the end, so the earlier offsets stay right.
    for (const { from, to } of tagRanges(line, tag).reverse()) {
        const spaceBefore = /\s/.test(result.charAt(from - 1));
        const start = spaceBefore ? from - 1 : from;
        const end = !spaceBefore && /\s/.test(result.charAt(to)) ? to + 1 : to;
        result = result.slice(0, start) + result.slice(end);
    }
    return result;
}
