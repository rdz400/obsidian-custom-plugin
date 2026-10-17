import type { CachedMetadata, ListItemCache } from 'obsidian';

/**
 * Reorder the top-level task hierarchies of a note by their tags, and close
 * the gaps between tasks.
 *
 * The structure — which lines form a hierarchy and which tags a task carries —
 * comes from Obsidian's metadata cache, which must describe exactly `text`.
 * Nothing here touches the editor or the vault, so it works on plain values.
 */

/** Which tags send a task hierarchy where, each list in priority order. */
export interface SortTags {
    top: readonly string[];
    bottom: readonly string[];
}

export interface SortResult {
    text: string;
    /** How many tagged task hierarchies were placed at the top or the bottom. */
    moved: number;
}

/** The parts of the metadata cache the sort reads. */
export type SortCache = Pick<CachedMetadata, 'listItems' | 'tags' | 'frontmatterPosition'>;

/** Where a tag sends a task hierarchy, and its position within that group. */
interface Placement {
    where: 'top' | 'bottom';
    order: number;
}

/** A line of the note, with whether it is part of a task's own text. */
interface Line {
    text: string;
    task: boolean;
}

/** A task hierarchy: lines [from, to] of the note, both inclusive. */
interface Block {
    root: ListItemCache;
    from: number;
    to: number;
}

function isBlank(line: Line | undefined): boolean {
    return line !== undefined && line.text.trim() === '';
}

/**
 * The note's lines, each marked with whether it is part of a task's own text,
 * continuation lines included. The mark travels with the line, so it still
 * holds once the lines have moved.
 */
function noteLines(text: string, cache: SortCache): Line[] {
    const tasks = new Set<number>();
    for (const item of cache.listItems ?? []) {
        if (item.task === undefined) continue;
        for (let i = item.position.start.line; i <= item.position.end.line; i++) tasks.add(i);
    }
    return text.split('\n').map((line, i) => ({ text: line, task: tasks.has(i) }));
}

/** Map each configured tag to its placement; a tag in both lists goes to the top. */
function placements(tags: SortTags): Map<string, Placement> {
    const map = new Map<string, Placement>();
    const add = (list: readonly string[], where: Placement['where']) =>
        list.forEach((tag, order) => {
            const key = tag.trim().replace(/^#/, '').toLowerCase();
            if (key.length > 0 && !map.has(key)) map.set(key, { where, order });
        });
    add(tags.top, 'top');
    add(tags.bottom, 'bottom');
    return map;
}

/**
 * Every top-level task with its subtree.
 *
 * Top-level items have a negative `parent`; a child's `parent` is the line its
 * parent starts on, and parents come before children, so one pass can map every
 * item to its root. An item's own `position` doesn't cover its children, so a
 * hierarchy ends where the last item in it does.
 *
 * Only unindented roots count: a list inside a callout or blockquote is also a
 * root, but moving it out of there would break the callout.
 */
function hierarchies(items: readonly ListItemCache[]): Block[] {
    const blocks = new Map<number, Block>();
    const rootLine = new Map<number, number>();
    for (const item of items) {
        const line = item.position.start.line;
        const root = item.parent < 0 ? line : rootLine.get(item.parent) ?? line;
        rootLine.set(line, root);

        const block = blocks.get(root);
        if (block) {
            block.to = Math.max(block.to, item.position.end.line);
        } else {
            blocks.set(root, { root: item, from: line, to: item.position.end.line });
        }
    }
    return [...blocks.values()].filter(
        (b) => b.root.task !== undefined && b.root.position.start.col === 0,
    );
}

/**
 * The placement of the last configured tag on the root task itself, or null.
 *
 * Tags on subtasks don't count. The last tag wins, so `#prio #misschien` goes
 * to the bottom: the tag closest to the end is the one added most recently.
 */
function placementOf(block: Block, cache: SortCache, map: Map<string, Placement>): Placement | null {
    const { start, end } = block.root.position;
    let found: Placement | null = null;
    // `tags` is in document order, so the last match is the last tag.
    for (const tag of cache.tags ?? []) {
        const line = tag.position.start.line;
        if (line < start.line || line > end.line) continue;
        found = map.get(tag.tag.replace(/^#/, '').toLowerCase()) ?? found;
    }
    return found;
}

/**
 * The note's lines without the moved blocks.
 *
 * A block that sat between two blank lines also takes one of them along, so
 * moving it out doesn't leave a double gap behind.
 */
function withoutBlocks(lines: readonly Line[], blocks: readonly Block[]): Line[] {
    const kept: Line[] = [];
    let next = 0;
    for (const block of blocks) {
        kept.push(...lines.slice(next, block.from));
        next = block.to + 1;
        if (isBlank(kept[kept.length - 1]) && isBlank(lines[next])) next++;
    }
    kept.push(...lines.slice(next));
    return kept;
}

/** The lines of `blocks`, in group order and, within a tag, in note order. */
function groupLines(
    lines: readonly Line[],
    blocks: readonly { block: Block; placement: Placement }[],
): Line[] {
    // `sort` is stable, so blocks with the same tag keep their order.
    return [...blocks]
        .sort((a, b) => a.placement.order - b.placement.order)
        .flatMap(({ block }) => lines.slice(block.from, block.to + 1));
}

/**
 * The lines without the blank lines that sit between two tasks.
 *
 * Only those: a blank line next to anything else can carry meaning — after a
 * heading, around a table, between paragraphs — so it stays.
 */
function withoutGapsBetweenTasks(lines: readonly Line[]): Line[] {
    const result: Line[] = [];
    for (let i = 0; i < lines.length; i++) {
        let next = i;
        while (isBlank(lines[next])) next++;
        // A run of blank lines from a task to a task: skip the whole run.
        if (next > i && result[result.length - 1]?.task && lines[next]?.task) {
            i = next - 1;
            continue;
        }
        const line = lines[i];
        if (line) result.push(line);
    }
    return result;
}

/**
 * Move tagged top-level task hierarchies to the top or the bottom of the body.
 *
 * The top group goes in front of the first non-blank body line, the bottom
 * group after the last one, so the blank line under the frontmatter and the
 * note's trailing newline stay where they are. Everything else keeps its order.
 * Blank lines between tasks are then removed, wherever they are in the note.
 */
export function reorderTasks(text: string, cache: SortCache, tags: SortTags): SortResult {
    const map = placements(tags);
    const tagged = hierarchies(cache.listItems ?? []).flatMap((block) => {
        const placement = placementOf(block, cache, map);
        return placement ? [{ block, placement }] : [];
    });
    const lines = noteLines(text, cache);
    const start = (cache.frontmatterPosition?.end.line ?? -1) + 1;
    const top = groupLines(lines, tagged.filter((t) => t.placement.where === 'top'));
    const bottom = groupLines(lines, tagged.filter((t) => t.placement.where === 'bottom'));
    const kept = withoutBlocks(lines, tagged.map((t) => t.block));

    const content: number[] = [];
    for (let i = start; i < kept.length; i++) {
        if (!isBlank(kept[i])) content.push(i);
    }
    // Nothing but moved tasks in the body: put them after its first blank line.
    const fallback = isBlank(kept[start]) && start + 1 < kept.length ? start + 1 : start;
    const topAt = content[0] ?? fallback;
    const bottomAt = (content[content.length - 1] ?? fallback - 1) + 1;

    // A group that ends up against prose, a heading or a table is kept apart
    // from it by a blank line: text right under a task would read as part of it.
    const apart = (line: Line | undefined): Line[] =>
        line && !isBlank(line) && !line.task ? [{ text: '', task: false }] : [];
    const topGap = top.length > 0 ? apart(kept[topAt]) : [];
    const bottomGap = bottom.length > 0 && bottomAt > start ? apart(kept[bottomAt - 1]) : [];

    const result = withoutGapsBetweenTasks([
        ...kept.slice(0, topAt),
        ...top,
        ...topGap,
        ...kept.slice(topAt, bottomAt),
        ...bottomGap,
        ...bottom,
        ...kept.slice(bottomAt),
    ]);
    return { text: result.map((line) => line.text).join('\n'), moved: tagged.length };
}
