import { type App, Notice, type TFile } from 'obsidian';

import { processAndParse } from '../../shared/vault';
import { withAppended } from '../listblocks';
import type { TaskItem } from '../taskitems';
import type { Drafts } from './draft';
import type { ManagerData } from './load';
import { compareNotes, noteTitle } from './model';
import { planChanges, summaryLines, type TaskPlace } from './plan';

/**
 * Writing the staged changes: check which notes changed since the manager
 * read them, plan without their changes, write every note once, and wait for
 * Obsidian to have parsed each, so reading the notes again sees what was
 * written. Also undoing that again, all or nothing.
 */

/** One note an apply wrote, as it was before and after. */
export interface WrittenNote {
    file: TFile;
    before: string;
    after: string;
}

export interface ApplyResult {
    /** The lines of the notice. */
    notice: string[];
    /** Per task, where it is after the apply. */
    places: TaskPlace[];
    written: WrittenNote[];
}

/** Write the changes in `drafts` to the notes in `data`. */
export async function applyChanges(app: App, data: ManagerData, drafts: Drafts): Promise<ApplyResult> {
    const order = compareNotes(data.gtd);
    const files = new Map(data.notes.map((note) => [note.file.path, note.file]));
    const notes = data.notes
        .map(({ file, text, lines }) => ({ path: file.path, text, lines }))
        .sort((a, b) => order(a.path, b.path));

    // Read every note involved first; a note changed since opening keeps its
    // own changes, moves out of it too, and is planned on its text as it is now.
    const involved = planChanges(notes, data.tasks, drafts).changes.map((change) => change.path);
    const changed = new Map<string, string>();
    for (const path of involved) {
        const file = files.get(path);
        if (!file) continue;
        const current = await app.vault.read(file);
        if (current !== notes.find((note) => note.path === path)?.text) changed.set(path, current);
    }
    const plan = planChanges(
        notes.map((note) => ({ ...note, text: changed.get(note.path) ?? note.text })),
        data.tasks,
        drafts,
        new Set(changed.keys()),
    );

    const written: WrittenNote[] = [];
    const raced: string[] = [];
    for (const change of plan.changes) {
        const file = files.get(change.path);
        if (!file) continue;
        let before = '';
        let after = '';
        await processAndParse(app, file, (current) => {
            before = current;
            if (current === change.base) after = change.text;
            // Appending doesn't depend on what the note holds.
            else if (!change.edited) after = withAppended(current, change.appended);
            else {
                raced.push(change.path);
                after = current;
            }
            return after;
        });
        if (after !== before) written.push({ file, before, after });
    }

    const nameOf = (path: string) => noteTitle(path, data.gtd);
    const notice = summaryLines(plan.summary, nameOf);
    for (const path of raced) {
        notice.push(`${nameOf(path)} changed while applying: tasks moved out of it are in both notes`);
    }
    if (notice.length === 0) notice.push('Nothing to apply');
    return { notice, places: plan.places, written };
}

/**
 * Put back every note the last apply wrote, if every one still holds what
 * was written: a half-undone move would lose or duplicate tasks. The notes
 * that got tasks back go first, so a failure leaves tasks in both notes.
 */
export async function undoApply(app: App, written: readonly WrittenNote[]): Promise<boolean> {
    for (const { file, after } of written) {
        if ((await app.vault.read(file)) !== after) return false;
    }
    for (const { file, before, after } of [...written].reverse()) {
        await processAndParse(app, file, (current) => (current === after ? before : current));
    }
    return true;
}

/** The last apply, for undoing it: what each note held, and where each task was before. */
export interface LastApply {
    written: WrittenNote[];
    /** By the index of a task as read after the apply. */
    before: ReadonlyMap<number, TaskPlace>;
}

/**
 * Where each task read after an apply was before it: `now` maps the indexes
 * of `tasks`, as read before, onto those read after.
 */
export function placesBefore(
    tasks: readonly TaskItem[],
    now: (i: number) => number | undefined,
): Map<number, TaskPlace> {
    const before = new Map<number, TaskPlace>();
    tasks.forEach((task, i) => {
        const at = now(i);
        if (at !== undefined) before.set(at, { path: task.file.path, raw: task.raw });
    });
    return before;
}

/** A notice of one or more lines. */
export function showNotice(lines: readonly string[]): void {
    new Notice(
        createFragment((fragment) =>
            lines.forEach((line, i) => {
                if (i > 0) fragment.createEl('br');
                fragment.appendText(line);
            }),
        ),
    );
}
