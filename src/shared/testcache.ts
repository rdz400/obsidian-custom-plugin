import type { ListItemCache, Loc, Pos, TagCache, TFile } from 'obsidian';

/**
 * For tests only: a stand-in for the note at `path`, with the fields the task
 * code reads. A real `TFile` can't be made outside Obsidian.
 */
export function testFile(path: string): TFile {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const file = {
        path,
        name,
        basename: name.replace(/\.md$/, ''),
        extension: 'md',
    };
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- no instanceof outside Obsidian
    return file as TFile;
}

/**
 * For tests only: the parts of Obsidian's metadata cache that the task code
 * reads, built from a note's text, so code that takes a cache can be tested
 * without Obsidian.
 *
 * Covers what the tests write: list items nested by indentation, with or
 * without a checkbox, whose text may run on in indented lines right below;
 * inline tags; and frontmatter at the top. A top-level item's `parent` is -1,
 * where Obsidian puts the negated line of the section; the code only checks
 * that it is negative.
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
        if (!item) {
            // An indented line right below an item is more of its text.
            const last = cache.listItems[cache.listItems.length - 1];
            if (last?.position.end.line === line - 1 && /^\s+\S/.test(raw)) {
                last.position.end = loc(line, raw.length);
            }
            continue;
        }
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
