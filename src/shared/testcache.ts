import type { ListItemCache, Loc, Pos, TagCache } from 'obsidian';

/**
 * For tests only: the parts of Obsidian's metadata cache that the task code
 * reads, built from a note's text, so code that takes a cache can be tested
 * without Obsidian.
 *
 * Covers what the tests write: list items of one line each, nested by
 * indentation, with or without a checkbox; inline tags; and frontmatter at the
 * top. A top-level item's `parent` is -1, where Obsidian puts the negated line
 * of the section; the code only checks that it is negative.
 */
export interface TestCache {
    listItems: ListItemCache[];
    tags: TagCache[];
    frontmatterPosition?: Pos;
}

const LIST_ITEM_RE = /^(\s*)[-*+] (?:\[(.)\] ?)?/;
const TAG_RE = /#[\w/-]+/g;

function loc(line: number, col: number): Loc {
    return { line, col, offset: 0 };
}

export function cacheOf(text: string): TestCache {
    const lines = text.split('\n');
    const cache: TestCache = { listItems: [], tags: [] };

    let bodyStart = 0;
    if (lines[0] === '---') {
        const end = lines.indexOf('---', 1);
        if (end > 0) {
            cache.frontmatterPosition = { start: loc(0, 0), end: loc(end, 3) };
            bodyStart = end + 1;
        }
    }

    // The items that are still open for children, outermost first.
    const open: { line: number; indent: number }[] = [];
    for (let line = bodyStart; line < lines.length; line++) {
        const raw = lines[line] ?? '';
        for (const match of raw.matchAll(TAG_RE)) {
            cache.tags.push({
                tag: match[0],
                position: { start: loc(line, match.index), end: loc(line, match.index + match[0].length) },
            });
        }

        const item = LIST_ITEM_RE.exec(raw);
        if (!item) continue;
        const indent = (item[1] ?? '').replace(/\t/g, '    ').length;
        while (open.length > 0 && open[open.length - 1]!.indent >= indent) open.pop();
        cache.listItems.push({
            parent: open[open.length - 1]?.line ?? -1,
            task: item[2],
            position: { start: loc(line, indent), end: loc(line, raw.length) },
        });
        open.push({ line, indent });
    }

    return cache;
}
