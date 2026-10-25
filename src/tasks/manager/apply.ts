import { type App, Notice } from 'obsidian';

import { processAndParse } from '../../shared/vault';
import { withAppended } from '../listblocks';
import type { Drafts } from './draft';
import type { ManagerData } from './load';
import { compareNotes, noteTitle } from './model';
import { planChanges, summaryLines } from './plan';

/**
 * Writing the staged changes: check which notes changed since the manager
 * read them, plan without their changes, write every note once, and wait for
 * Obsidian to have parsed each. It runs after the modal has closed; opening
 * the manager again waits for it, so it reads what was written.
 */

/**
 * Write the changes in `drafts` to the notes in `data`; returns the lines of
 * the notice saying what was applied and what skipped.
 */
export async function applyChanges(app: App, data: ManagerData, drafts: Drafts): Promise<string[]> {
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

    // Every note found before anything is written: tasks taken out of one
    // note and not added to the next would be lost.
    const writes = plan.changes.map((change) => {
        const file = files.get(change.path);
        if (!file) throw new Error(`${change.path} not found; nothing was changed`);
        return { change, file };
    });

    const raced: string[] = [];
    for (const { change, file } of writes) {
        await processAndParse(app, file, (current) => {
            if (current === change.base) return change.text;
            // Appending doesn't depend on what the note holds.
            if (!change.edited) return withAppended(current, change.appended);
            raced.push(change.path);
            return current;
        });
    }

    const nameOf = (path: string) => noteTitle(path, data.gtd);
    const notice = summaryLines(plan.summary, nameOf);
    for (const path of raced) {
        notice.push(`${nameOf(path)} changed while applying: tasks moved out of it are in both notes`);
    }
    if (notice.length === 0) notice.push('Nothing to apply');
    return notice;
}

/** The applies started, one after the other; settled once the last is written. */
let applying: Promise<void> = Promise.resolve();

/**
 * Apply the changes once any earlier apply is done, and say in a notice what
 * was applied, or that it failed.
 */
export function applyInBackground(app: App, data: ManagerData, drafts: Drafts): Promise<void> {
    applying = applying.then(async () => {
        try {
            showNotice(await applyChanges(app, data, drafts));
        } catch (error) {
            new Notice(`Could not apply: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    return applying;
}

/** Settles once every apply started is written and parsed. */
export function appliesDone(): Promise<void> {
    return applying;
}

/** A notice of one or more lines. */
function showNotice(lines: readonly string[]): void {
    new Notice(
        createFragment((fragment) =>
            lines.forEach((line, i) => {
                if (i > 0) fragment.createEl('br');
                fragment.appendText(line);
            }),
        ),
    );
}
