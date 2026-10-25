import type { TFile } from 'obsidian';

import { LINK_RE, TAG_RE, tagsOnLine } from '../shared/markdown';
import { isDoneMarker, type ListLine } from '../shared/taskline';
import type { GtdNote } from './gtdnotes';
import type { TaskNoteBadge } from './tasknotes';

/**
 * The tasks of the task notes as the task search and the task manager show
 * them, and the edits made to a task's line.
 *
 * Nothing here needs Obsidian, so the tests can build tasks from a note's
 * text; reading them from the vault is `collectTaskNoteTasks` in tasknotes.ts.
 */

/** One task line found in a task note, with everything shown for it. */
export interface TaskItem {
    file: TFile;
    /** Which note the task is in, as shown next to its nesting level. */
    note: TaskNoteBadge;
    /** Which GTD note the task is in, if it is in one; what the note chips filter on. */
    gtd: GtdNote['id'] | undefined;
    /** Line number at collection time; only a hint, the file may change before a write. */
    line: number;
    /** The full raw source line, used to verify the line hint still points at this task. */
    raw: string;
    /** The task text with list marker, checkbox and tags stripped out. */
    text: string;
    /** True when the checkbox is ticked. */
    done: boolean;
    /** How deeply the task is nested: 1 for a top-level item, 2 under it, etc. */
    depth: number;
    /** The line the nearest task above it starts on, plain bullets skipped; undefined for none. */
    parent: number | undefined;
    /** The tags written on the task's own line. */
    ownTags: string[];
    /** Own tags first, then those inherited from ancestors. */
    tags: string[];
    /** Own link targets first, then those inherited from ancestors. */
    links: string[];
}

/** Set the checkbox marker of a task line, e.g. "- [ ] Foo" -> "- [x] Foo". */
export function setTaskMarker(line: string, marker: string): string {
    return line.replace(/^(\s*[-*+]\s+)\[[^\]]\]/, `$1[${marker}]`);
}

/**
 * The readable part of a list line: marker, checkbox and tags removed, since
 * tags are rendered as their own chips beside the text.
 *
 * Wikilinks are kept in place: stripping them mangles sentences built around
 * them ("- [ ] Bel [[Jan]] over de tuin") and empties a task that is nothing
 * but a link. They are styled where they stand, with their brackets, so they
 * stay recognisable as links, see `textParts`.
 */
export function taskText(raw: string): string {
    return raw
        .replace(/^\s*[-*+]\s+(?:\[[^\]]\]\s?)?/, '')
        .replace(TAG_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** A run of task text: either plain words or a single wikilink. */
export interface TextPart {
    text: string;
    link: boolean;
}

/**
 * Split task text into plain runs and wikilinks, so the links can be given
 * their own styling while keeping their position in the sentence.
 *
 * A link is shown by its display text where the source gives one, wrapped back
 * in "[[…]]" so it reads as a link without being clickable.
 */
export function textParts(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let at = 0;

    for (const match of text.matchAll(LINK_RE)) {
        const start = match.index;
        const plain = text.slice(at, start);
        if (plain.length > 0) parts.push({ text: plain, link: false });

        const label = (match[2] ?? match[1] ?? '').trim();
        parts.push({ text: `[[${label}]]`, link: true });
        at = start + match[0].length;
    }

    const rest = text.slice(at);
    if (rest.length > 0) parts.push({ text: rest, link: false });

    return parts;
}

/**
 * Where `task` is among `lines`, the note's lines as they are now.
 *
 * The line number captured at collection time goes stale as soon as anything
 * above the task changes, so it is only trusted when the text there still
 * matches; otherwise the one line with the task's text is taken. Undefined
 * when the text is gone or on several lines, rather than guessing.
 */
export function findTaskLine(
    lines: readonly string[],
    task: Pick<TaskItem, 'line' | 'raw'>,
): number | undefined {
    if (lines[task.line] === task.raw) return task.line;
    const matches = lines.flatMap((line, i) => (line === task.raw ? [i] : []));
    return matches.length === 1 ? matches[0] : undefined;
}

/**
 * The tasks among the list items of one note, in note order.
 *
 * Plain bullets pass their tags and links on to the tasks below them and count
 * towards their depth, see `listLines`, but are not tasks themselves: only
 * checkboxes are.
 */
export function noteTaskItems(
    file: TFile,
    note: TaskNoteBadge,
    gtd: GtdNote['id'] | undefined,
    lines: readonly ListLine[],
): TaskItem[] {
    const byLine = new Map(lines.map((listLine) => [listLine.line, listLine]));
    const tasks: TaskItem[] = [];

    for (const listLine of lines) {
        const { line, raw, marker, depth, tags, links } = listLine;
        if (marker === undefined) continue;
        tasks.push({
            file,
            note,
            gtd,
            line,
            raw,
            text: taskText(raw),
            done: isDoneMarker(marker),
            depth,
            parent: parentTask(listLine, byLine),
            ownTags: tagsOnLine(raw),
            tags,
            links,
        });
    }

    return tasks;
}

/** The line the nearest task above `item` starts on, past any plain bullets in between. */
function parentTask(item: ListLine, byLine: ReadonlyMap<number, ListLine>): number | undefined {
    let parent = item.parent === undefined ? undefined : byLine.get(item.parent);
    while (parent && parent.marker === undefined) {
        parent = parent.parent === undefined ? undefined : byLine.get(parent.parent);
    }
    return parent?.line;
}
