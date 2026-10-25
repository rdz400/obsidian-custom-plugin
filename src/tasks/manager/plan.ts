import type { ListLine } from '../../shared/taskline';
import { listItemLines, outdent, withAppended, withoutLines } from '../listblocks';
import { addTag, removeTag } from '../taglines';
import { setTaskMarker, type TaskItem } from '../taskitems';
import type { Drafts } from './draft';

/**
 * Planning an apply: from the notes' texts and the drafts to the new text of
 * every note that changes. Nothing here writes; apply.ts does that.
 *
 * Tags and checkboxes are changed on the task's own line, then the move roots
 * are taken out with their subtrees, as "Move line(s) to …" takes them, and
 * appended to their target, outdented to top level.
 */

/** A note as planned against: its text and its list items. */
export interface PlanNote {
    path: string;
    text: string;
    lines: readonly ListLine[];
}

/** The new text of one note. */
export interface NoteChange {
    path: string;
    /** The text that was planned against. */
    base: string;
    text: string;
    /** The lines appended, the tasks moved into the note; empty for none. */
    appended: string;
    /**
     * Whether the note's own lines change (edited or taken out), so its new
     * text only holds while the note is still `base`. Without, the appended
     * lines can go at the end of whatever the note holds by then.
     */
    edited: boolean;
}

/** Where a task is once applied. */
export interface TaskPlace {
    path: string;
    raw: string;
}

export interface Summary {
    /** How many tasks each note receives. */
    moved: Map<string, number>;
    tagged: number;
    finished: number;
    reopened: number;
    /** How many changed tasks are left alone in each skipped note. */
    skipped: Map<string, number>;
}

export interface Plan {
    /** The notes receiving tasks first, so a failure in between leaves tasks in both notes. */
    changes: NoteChange[];
    /** Per task, where it is after the apply. */
    places: TaskPlace[];
    summary: Summary;
}

/**
 * Plan the changes in `drafts` against `notes`, given in group order: tasks
 * moved into a note are appended in that order, then in note order.
 *
 * The changes of the tasks in `skip` notes are left out, moves out of them
 * too; tasks can still be moved into them. So is a note whose tasks no longer
 * match its text. A target that isn't in `notes` counts as empty.
 */
export function planChanges(
    notes: readonly PlanNote[],
    tasks: readonly TaskItem[],
    drafts: Drafts,
    skip: ReadonlySet<string> = new Set(),
): Plan {
    const places = tasks.map((task) => ({ path: task.file.path, raw: task.raw }));
    const summary: Summary = { moved: new Map(), tagged: 0, finished: 0, reopened: 0, skipped: new Map() };
    const kept = new Map<string, string>();
    const incoming = new Map<string, string[]>();

    const byNote = new Map<string, number[]>();
    tasks.forEach((task, i) => byNote.set(task.file.path, [...(byNote.get(task.file.path) ?? []), i]));

    for (const note of notes) {
        const indexes = byNote.get(note.path) ?? [];
        const lines = note.text.split('\n');
        if (skip.has(note.path) || indexes.some((i) => lines[tasks[i]!.line] !== tasks[i]!.raw)) {
            const skipped = indexes.filter((i) => drafts.isChanged(i)).length;
            if (skipped > 0) summary.skipped.set(note.path, skipped);
            continue;
        }

        let edited = false;
        for (const i of indexes) {
            const { line } = tasks[i]!;
            const raw = editedLine(lines[line]!, drafts, i, summary);
            places[i] = { path: note.path, raw };
            if (raw === lines[line]) continue;
            lines[line] = raw;
            edited = true;
        }

        // A nested root comes after its outer root, so its lines end up its own.
        const roots = indexes.filter((i) => drafts.isMoveRoot(i));
        const spans = note.lines.map(({ line, end, parent }) => ({ start: line, end, parent }));
        const owner = new Map<number, number>();
        for (const root of roots) {
            for (const line of listItemLines(spans, tasks[root]!.line, tasks[root]!.line).lines) {
                owner.set(line, root);
            }
        }

        for (const root of roots) {
            const target = drafts.destination(root);
            const block = [...owner].flatMap(([line, of]) => (of === root ? [line] : [])).sort((a, b) => a - b);
            const taken = outdent(block.map((line) => lines[line]!), new Set([0]));
            incoming.set(target, [...(incoming.get(target) ?? []), ...taken]);

            block.forEach((line, k) => {
                const i = drafts.taskAt(note.path, line);
                if (i === undefined) return;
                places[i] = { path: target, raw: taken[k]! };
                summary.moved.set(target, (summary.moved.get(target) ?? 0) + 1);
            });
        }

        if (owner.size > 0 || edited) {
            kept.set(note.path, withoutLines(lines, new Set(owner.keys())).join('\n'));
        }
    }

    const baseOf = new Map(notes.map((note) => [note.path, note.text]));
    const changes: NoteChange[] = [];
    for (const path of new Set([...incoming.keys(), ...kept.keys()])) {
        const base = baseOf.get(path) ?? '';
        const added = incoming.get(path)?.join('\n') ?? '';
        const body = kept.get(path) ?? base;
        const text = added.length > 0 ? withAppended(body, added) : body;
        if (text !== base) changes.push({ path, base, text, appended: added, edited: kept.has(path) });
    }
    // Stable, so the notes stay in group order within both parts.
    changes.sort((a, b) => Number(b.appended.length > 0) - Number(a.appended.length > 0));

    return { changes, places, summary };
}

/** Task `i`'s line with its draft's tags and checkbox, counted in `summary`. */
function editedLine(raw: string, drafts: Drafts, i: number, summary: Summary): string {
    const base = drafts.base(i);
    const draft = drafts.draft(i);
    let line = raw;
    for (const tag of base.ownTags) if (!draft.ownTags.includes(tag)) line = removeTag(line, tag);
    for (const tag of draft.ownTags) if (!base.ownTags.includes(tag)) line = addTag(line, tag);
    if (line !== raw) summary.tagged++;

    if (draft.done !== base.done) {
        line = setTaskMarker(line, draft.done ? 'x' : ' ');
        if (draft.done) summary.finished++;
        else summary.reopened++;
    }
    return line;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The notice for an apply: "Applied: 4 moved to today, 3 tagged, 2 finished",
 * then a line per skipped note. `nameOf` names a note by its path.
 */
export function summaryLines(summary: Summary, nameOf: (path: string) => string): string[] {
    const parts = [
        ...[...summary.moved].map(([path, n]) => `${n} moved to ${nameOf(path)}`),
        ...(summary.tagged > 0 ? [`${summary.tagged} tagged`] : []),
        ...(summary.finished > 0 ? [`${summary.finished} finished`] : []),
        ...(summary.reopened > 0 ? [`${summary.reopened} reopened`] : []),
    ];
    const lines = parts.length > 0 ? [`Applied: ${parts.join(', ')}`] : [];
    for (const [path, n] of summary.skipped) {
        lines.push(`Skipped ${plural(n, 'change')} in ${nameOf(path)}: the note changed since opening`);
    }
    return lines;
}
