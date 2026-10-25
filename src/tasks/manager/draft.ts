import type { GtdNote } from '../gtdnotes';
import type { TaskItem } from '../taskitems';

/**
 * The changes staged in the task manager, kept as the state each task should
 * end up in rather than as a list of operations. Every task starts with a
 * draft equal to what its note says; a draft that comes back to that by hand
 * simply counts as unchanged again.
 *
 * Where a task ends up is derived, not stored: its own move, or else where
 * the nearest task above it ends up, or else the note it's in. So a parent's
 * move takes its subtree along, and a subtask with a move of its own is cut
 * out of it.
 */

/** One of the GTD notes, by its id. */
export type GtdId = GtdNote['id'];

/** What a task should be once the changes are applied. */
export interface Draft {
    /** The tags on the task's own line. */
    ownTags: readonly string[];
    done: boolean;
    /** Set only when the task itself is moved. */
    moveTo?: GtdId;
}

/** Whether two tag lists hold the same tags, in whatever order. */
export function sameTags(a: readonly string[], b: readonly string[]): boolean {
    const set = new Set(a);
    return set.size === new Set(b).size && b.every((tag) => set.has(tag));
}

/**
 * The drafts of every task, with the history of the actions that changed
 * them. A task is known by its index in `tasks`.
 */
export class Drafts {
    private readonly tasks: readonly TaskItem[];
    private readonly targets: ReadonlyMap<GtdId, string>;
    private readonly bases: readonly Draft[];
    private drafts: Draft[];
    /** The index of each task's parent task. */
    private readonly parents: readonly (number | undefined)[];
    private readonly byLine = new Map<string, Map<number, number>>();
    /** Per action, the drafts it changed as they were before. */
    private history: Map<number, Draft>[] = [];

    /** `targets` holds the path of each GTD note tasks can be moved to. */
    constructor(tasks: readonly TaskItem[], targets: ReadonlyMap<GtdId, string>) {
        this.tasks = tasks;
        this.targets = targets;
        tasks.forEach((task, i) => {
            const lines = this.byLine.get(task.file.path) ?? new Map<number, number>();
            lines.set(task.line, i);
            this.byLine.set(task.file.path, lines);
        });
        this.parents = tasks.map((task) =>
            task.parent === undefined ? undefined : this.taskAt(task.file.path, task.parent),
        );
        this.bases = tasks.map((task) => ({ ownTags: task.ownTags, done: task.done }));
        this.drafts = [...this.bases];
    }

    /** The task that starts on `line` of the note at `path`, if any. */
    taskAt(path: string, line: number): number | undefined {
        return this.byLine.get(path)?.get(line);
    }

    /** The nearest task above task `i` in its note, if any. */
    parentOf(i: number): number | undefined {
        return this.parents[i];
    }

    draft(i: number): Draft {
        return this.drafts[i]!;
    }

    /** What the note says about task `i`. */
    base(i: number): Draft {
        return this.bases[i]!;
    }

    /** The path of the note task `i` ends up in. */
    destination(i: number): string {
        const moveTo = this.draft(i).moveTo;
        return (moveTo && this.targets.get(moveTo)) ?? this.inherited(i);
    }

    /** Where task `i` ends up without a move of its own: with its parent, or in its note. */
    private inherited(i: number): string {
        const parent = this.parents[i];
        return parent === undefined ? this.tasks[i]!.file.path : this.destination(parent);
    }

    /**
     * Whether task `i` is cut out of its note or its parent's subtree: it
     * ends up somewhere else than its parent, or than its note at top level.
     */
    isMoveRoot(i: number): boolean {
        return this.destination(i) !== this.inherited(i);
    }

    /** The move root task `i` goes with: itself or the nearest task above it that is one. */
    moveRoot(i: number): number | undefined {
        for (let k: number | undefined = i; k !== undefined; k = this.parents[k]) {
            if (this.isMoveRoot(k)) return k;
        }
        return undefined;
    }

    /** How deeply task `i` is nested among tasks once moved: 1 for a top-level task. */
    depth(i: number): number {
        const parent = this.parents[i];
        if (parent === undefined || this.isMoveRoot(i)) return 1;
        return this.depth(parent) + 1;
    }

    /** Whether applying would change task `i`: its tags, its checkbox, or where it is. */
    isChanged(i: number): boolean {
        const draft = this.draft(i);
        const base = this.base(i);
        return (
            !sameTags(draft.ownTags, base.ownTags) ||
            draft.done !== base.done ||
            this.moveRoot(i) !== undefined
        );
    }

    /** The tasks applying would change, in order. */
    changed(): number[] {
        return this.tasks.flatMap((_, i) => (this.isChanged(i) ? [i] : []));
    }

    /** Give each task in `indexes` the tag on its own line, or take it off. */
    setTag(indexes: Iterable<number>, tag: string, on: boolean): boolean {
        return this.change(indexes, (draft) => {
            if (draft.ownTags.includes(tag) === on) return draft;
            const ownTags = on ? [...draft.ownTags, tag] : draft.ownTags.filter((own) => own !== tag);
            return { ...draft, ownTags };
        });
    }

    /** Tick or untick each task in `indexes`. */
    setDone(indexes: Iterable<number>, done: boolean): boolean {
        return this.change(indexes, (draft) => (draft.done === done ? draft : { ...draft, done }));
    }

    /**
     * Move each task in `indexes`, with its subtree, to a GTD note.
     *
     * In note order, so a parent is moved before its subtasks are looked at:
     * a subtask that its parent now takes there needs no move of its own, and
     * one moved to where it would be anyway loses the move it had.
     */
    move(indexes: Iterable<number>, to: GtdId): boolean {
        const ordered = [...indexes].sort((a, b) => a - b);
        return this.change(ordered, (draft, i) => {
            const moveTo = this.targets.get(to) === this.inherited(i) ? undefined : to;
            return draft.moveTo === moveTo ? draft : { ...draft, moveTo };
        });
    }

    /** Whether there is an action to undo. */
    get canUndo(): boolean {
        return this.history.length > 0;
    }

    /** Put back the drafts as they were before the last action. */
    undo(): boolean {
        const earlier = this.history.pop();
        if (!earlier) return false;
        for (const [i, draft] of earlier) this.drafts[i] = draft;
        return true;
    }

    /** Drop every staged change, and the history with it. */
    discard(): void {
        this.drafts = [...this.bases];
        this.history = [];
    }

    /**
     * Apply `edit` to the draft of each task in `indexes`, one after the
     * other, and keep the drafts it changed as one step in the history.
     * Returns whether anything changed.
     */
    private change(indexes: Iterable<number>, edit: (draft: Draft, i: number) => Draft): boolean {
        const earlier = new Map<number, Draft>();
        for (const i of indexes) {
            const draft = this.draft(i);
            const next = edit(draft, i);
            if (next === draft) continue;
            if (!earlier.has(i)) earlier.set(i, draft);
            this.drafts[i] = next;
        }
        if (earlier.size === 0) return false;
        this.history.push(earlier);
        return true;
    }
}
