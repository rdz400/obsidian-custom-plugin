import { addMissing, tagsOnLine } from '../../shared/markdown';
import type { ListLine } from '../../shared/taskline';
import type { TaskNoteLines } from '../../shared/tasknotes';
import type { TaskItem } from '../taskitems';
import type { Drafts, GtdId } from './draft';

/**
 * What the task manager shows, worked out from the drafts: every task as it
 * will be once applied, the filters on that, and the list grouped by note as
 * a tree.
 */

/** A GTD note that is set, in GTD order. */
export interface GtdTarget {
    id: GtdId;
    /** Its role: "today", "someday", … */
    name: string;
    path: string;
}

export interface Filters {
    /** Tags a task must all carry, own or inherited; nested tags count. */
    tags: ReadonlySet<string>;
    /** GTD notes a task must be in one of; none means any note. */
    notes: ReadonlySet<string>;
    /** Whether finished tasks show. */
    done: boolean;
    /** Whether only top-level tasks show. */
    topLevel: boolean;
}

/** A task as it will be once applied. */
export interface EndState {
    path: string;
    gtd: GtdId | undefined;
    /** Own tags first, then inherited ones. */
    tags: string[];
    done: boolean;
    /** Task depth, 1 for a top-level task. */
    depth: number;
    /** The task above it, if any. */
    parent: number | undefined;
}

/** The end state of every task. */
export function endStates(
    notes: readonly TaskNoteLines[],
    tasks: readonly TaskItem[],
    drafts: Drafts,
    gtd: readonly GtdTarget[],
): EndState[] {
    const lines = new Map(notes.map(({ file, lines }) => [file.path, new Map(lines.map((l) => [l.line, l]))]));
    const gtdOf = new Map(gtd.map(({ id, path }) => [path, id]));

    return tasks.map((task, i) => {
        const path = drafts.destination(i);
        const root = drafts.isMoveRoot(i);
        return {
            path,
            gtd: gtdOf.get(path),
            tags: endTags(lines.get(task.file.path) ?? new Map(), task, i, drafts),
            done: drafts.draft(i).done,
            depth: drafts.depth(i),
            parent: root ? undefined : drafts.parentOf(i),
        };
    });
}

/**
 * The tags task `i` carries once applied: its own draft's, then those of the
 * items above it that stay above it. A move root leaves its ancestors behind;
 * above a task, its draft counts, above a plain bullet what its line says.
 */
function endTags(lines: ReadonlyMap<number, ListLine>, task: TaskItem, i: number, drafts: Drafts): string[] {
    const tags = [...drafts.draft(i).ownTags];
    if (drafts.isMoveRoot(i)) return tags;

    const inherited: string[] = [];
    let item = lineAbove(lines, lines.get(task.line));
    while (item) {
        const k = drafts.taskAt(task.file.path, item.line);
        if (k === undefined) {
            inherited.push(...tagsOnLine(item.raw));
        } else {
            inherited.push(...drafts.draft(k).ownTags);
            if (drafts.isMoveRoot(k)) break;
        }
        item = lineAbove(lines, item);
    }
    return addMissing(tags, inherited);
}

function lineAbove(lines: ReadonlyMap<number, ListLine>, item: ListLine | undefined): ListLine | undefined {
    return item?.parent === undefined ? undefined : lines.get(item.parent);
}

/** Whether a task with `tags` carries every one of `wanted`; `#prio/x` counts as `prio`. */
function hasTags(tags: readonly string[], wanted: Iterable<string>): boolean {
    return [...wanted].every((want) => tags.some((tag) => tag === want || tag.startsWith(`${want}/`)));
}

/** Whether `end` passes the filters: all tags (AND), any of the notes (OR), and the view chips. */
export function matches(end: EndState, filters: Filters): boolean {
    return (
        hasTags(end.tags, filters.tags) &&
        (filters.notes.size === 0 || (end.gtd !== undefined && filters.notes.has(end.gtd))) &&
        (filters.done || !end.done) &&
        (!filters.topLevel || end.depth === 1)
    );
}

/** The tasks passing the filters. */
export function matching(ends: readonly EndState[], filters: Filters): Set<number> {
    return new Set(ends.flatMap((end, i) => (matches(end, filters) ? [i] : [])));
}

/**
 * The tasks shown: those passing the filters, and those `pinned`, the ones
 * that passed at the last filter change. So a task changed since then stays
 * on screen even when the filters would now hide it.
 */
export function visibleTasks(
    ends: readonly EndState[],
    filters: Filters,
    pinned: ReadonlySet<number>,
): Set<number> {
    return new Set([...pinned, ...matching(ends, filters)]);
}

/** One row of the list: a task, or a dimmed context row for a task above a shown one. */
export interface Row {
    index: number;
    depth: number;
    context: boolean;
}

export interface Group {
    path: string;
    title: string;
    /** How many shown tasks it has, context rows left out. */
    count: number;
    rows: Row[];
}

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** What a note is called in the manager: its GTD role, or else its name. */
export function noteTitle(path: string, gtd: readonly GtdTarget[]): string {
    return gtd.find((note) => note.path === path)?.name ?? basename(path);
}

/** The order of the groups: the GTD notes in GTD order, then the other notes by name. */
export function compareNotes(gtd: readonly GtdTarget[]): (a: string, b: string) => number {
    const rank = (path: string) => {
        const index = gtd.findIndex((note) => note.path === path);
        return index === -1 ? gtd.length : index;
    };
    return (a, b) => rank(a) - rank(b) || basename(a).localeCompare(basename(b)) || a.localeCompare(b);
}

/**
 * The shown tasks grouped by the note they end up in, as a tree.
 *
 * Within a group the tasks staying in the note come first, in note order;
 * then the tasks moved in, where Apply appends them: by the group they come
 * from, then in note order, each move root followed by its subtree.
 */
export function groupRows(
    ends: readonly EndState[],
    tasks: readonly TaskItem[],
    drafts: Drafts,
    visible: ReadonlySet<number>,
    gtd: readonly GtdTarget[],
): Group[] {
    const context = new Map<number, boolean>([...visible].map((i) => [i, false]));
    for (const i of visible) {
        for (let k = ends[i]!.parent; k !== undefined && !context.has(k); k = ends[k]!.parent) {
            context.set(k, true);
        }
    }

    const order = compareNotes(gtd);
    // [moved, source note, move root, task]: a task staying sorts on itself alone.
    const key = (i: number): [number, string, number, number] => {
        const root = drafts.moveRoot(i);
        if (root === undefined) return [0, '', 0, i];
        return [1, tasks[root]!.file.path, root, i];
    };
    const before = (a: number, b: number) => {
        const [ka, kb] = [key(a), key(b)];
        return ka[0] - kb[0] || order(ka[1], kb[1]) || ka[2] - kb[2] || ka[3] - kb[3];
    };

    const byPath = new Map<string, number[]>();
    for (const i of context.keys()) byPath.set(ends[i]!.path, [...(byPath.get(ends[i]!.path) ?? []), i]);

    return [...byPath.keys()].sort(order).map((path) => {
        const rows = byPath
            .get(path)!
            .sort(before)
            .map((index) => ({ index, depth: ends[index]!.depth, context: context.get(index)! }));
        return { path, title: noteTitle(path, gtd), count: rows.filter((row) => !row.context).length, rows };
    });
}

/** The tasks that can be selected and focused, in list order: context rows left out. */
export function selectableRows(groups: readonly Group[]): number[] {
    return groups.flatMap((group) => group.rows.flatMap((row) => (row.context ? [] : [row.index])));
}

/**
 * How many tasks each tag chip stands for, counted against the other active
 * filters: what turning it on would leave, or what it lets through when on.
 */
export function tagCounts(ends: readonly EndState[], filters: Filters, chips: readonly string[]): Map<string, number> {
    return new Map(
        chips.map((tag) => {
            const tags = new Set([...filters.tags].filter((active) => active !== tag)).add(tag);
            return [tag, ends.filter((end) => matches(end, { ...filters, tags })).length];
        }),
    );
}

/** How many tasks each GTD note chip stands for: those in it passing the other filters. */
export function noteCounts(ends: readonly EndState[], filters: Filters, ids: readonly string[]): Map<string, number> {
    const others = { ...filters, notes: new Set<string>() };
    return new Map(ids.map((id) => [id, ends.filter((end) => end.gtd === id && matches(end, others)).length]));
}

/** How many of the selected tasks have a tag on their own line: none, some or all. */
export type TagState = 'none' | 'some' | 'all';

export function tagState(drafts: Drafts, selection: Iterable<number>, tag: string): TagState {
    const selected = [...selection];
    const tagged = selected.filter((i) => drafts.draft(i).ownTags.includes(tag)).length;
    if (tagged === 0) return 'none';
    return tagged === selected.length ? 'all' : 'some';
}

/** Whether every selected task is done in its draft, so Finish becomes Reopen. */
export function allDone(drafts: Drafts, selection: Iterable<number>): boolean {
    const selected = [...selection];
    return selected.length > 0 && selected.every((i) => drafts.draft(i).done);
}

/** Whether every selected task already ends up in the note at `path`. */
export function allIn(ends: readonly EndState[], selection: Iterable<number>, path: string): boolean {
    const selected = [...selection];
    return selected.length > 0 && selected.every((i) => ends[i]!.path === path);
}

/** "42 tasks", "3 of 42 selected", then "· 3 changed" while changes are pending. */
export function tallyText(shown: number, selected: number, changed: number): string {
    const base = selected === 0 ? `${shown} ${shown === 1 ? 'task' : 'tasks'}` : `${selected} of ${shown} selected`;
    return changed > 0 ? `${base} · ${changed} changed` : base;
}
