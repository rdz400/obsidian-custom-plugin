import type { CachedMetadata, ListItemCache } from 'obsidian';

/** The parts of the metadata cache read here; it must describe exactly the text. */
export type TaskCache = Pick<CachedMetadata, 'listItems' | 'tags' | 'frontmatterPosition'>;

/** A line of the note; `task` marks a task's own text, so it survives moving. */
interface Line {
    text: string;
    task: boolean;
}

/** A top-level task and its subtasks: lines [from, to], both inclusive. */
interface Block {
    root: ListItemCache;
    from: number;
    to: number;
}

const isBlank = (line: Line | undefined) => line !== undefined && line.text.trim() === '';

/**
 * Every top-level task with its subtree.
 *
 * A child's `parent` is the line its parent starts on, and parents come first,
 * so one pass maps every item to its root. Indented roots (lists in a callout
 * or blockquote) are left out: moving them would break the callout.
 */
function hierarchies(cache: TaskCache): Block[] {
    const blocks = new Map<number, Block>();
    const rootLine = new Map<number, number>();
    for (const item of cache.listItems ?? []) {
        const line = item.position.start.line;
        const root = item.parent < 0 ? line : rootLine.get(item.parent) ?? line;
        rootLine.set(line, root);
        const block = blocks.get(root);
        if (block) block.to = Math.max(block.to, item.position.end.line);
        else blocks.set(root, { root: item, from: line, to: item.position.end.line });
    }
    return [...blocks.values()].filter(
        (b) => b.root.task !== undefined && b.root.position.start.col === 0,
    );
}

/** The tags on the root task itself, lower case and without `#`. */
function rootTags(block: Block, cache: TaskCache): string[] {
    const { start, end } = block.root.position;
    return (cache.tags ?? [])
        .filter((t) => t.position.start.line >= start.line && t.position.start.line <= end.line)
        .map((t) => t.tag.slice(1).toLowerCase());
}

/** The tags on the note's top-level tasks, sorted. */
export function topLevelTaskTags(cache: TaskCache): string[] {
    const tags = new Set(hierarchies(cache).flatMap((block) => rootTags(block, cache)));
    return [...tags].sort();
}

/**
 * Move the top-level tasks tagged `tag`, with their subtasks, in front of the
 * first non-blank body line, keeping their order. Then drop the blank lines
 * between tasks; blank lines next to anything else stay.
 */
export function moveTaggedToTop(text: string, cache: TaskCache, tag: string): string {
    const taskLines = new Set<number>();
    for (const item of cache.listItems ?? []) {
        if (item.task === undefined) continue;
        for (let i = item.position.start.line; i <= item.position.end.line; i++) taskLines.add(i);
    }
    const lines = text.split('\n').map((text, i): Line => ({ text, task: taskLines.has(i) }));
    const tagged = hierarchies(cache).filter((block) => rootTags(block, cache).includes(tag));

    // Take the tagged blocks out. One between two blank lines takes one of
    // them along, so no double gap is left behind.
    const kept: Line[] = [];
    let next = 0;
    for (const { from, to } of tagged) {
        kept.push(...lines.slice(next, from));
        next = to + 1;
        if (isBlank(kept[kept.length - 1]) && isBlank(lines[next])) next++;
    }
    kept.push(...lines.slice(next));

    const start = (cache.frontmatterPosition?.end.line ?? -1) + 1;
    let at = start;
    while (at < kept.length && isBlank(kept[at])) at++;
    // A body of nothing but blank lines: insert after the first, keeping the last.
    if (at === kept.length) at = start + 1 < kept.length ? start + 1 : start;

    // Text right under the last task would read as part of it.
    const after = kept[at];
    const gap = after && !isBlank(after) && !after.task ? [{ text: '', task: false }] : [];
    const moved = tagged.flatMap(({ from, to }) => lines.slice(from, to + 1));
    const all = [...kept.slice(0, at), ...moved, ...gap, ...kept.slice(at)];

    // Drop runs of blank lines that go from a task to a task.
    const result: Line[] = [];
    for (let i = 0; i < all.length; i++) {
        let j = i;
        while (isBlank(all[j])) j++;
        if (j > i && result[result.length - 1]?.task && all[j]?.task) i = j - 1;
        else result.push(all[i]!);
    }
    return result.map((line) => line.text).join('\n');
}
