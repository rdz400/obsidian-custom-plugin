import { App, Editor, Notice, TFile } from 'obsidian';

import { replaceChanged, restoreCursor } from '../shared/editor/lines';
import { freshCache } from '../shared/editor/freshcache';
import type { RonaldSettings } from '../settings';
import { appendToNote } from '../shared/vault';
import { GTD_NOTES } from './gtdnotes';
import { takeByDestination } from './reorder';

type GtdNote = (typeof GTD_NOTES)[number];

/**
 * Move every top-level task in `file` with a GTD note's tag, with its
 * subtasks, to the end of that note, as set in settings.
 *
 * The first such tag on the task decides, so a task tagged for two notes goes
 * to the one written first. A task whose note is `file` itself, or isn't set
 * or doesn't exist, stays.
 *
 * The tasks are added to their notes before they are taken out of `file`, and
 * taken out in one edit, so a single undo puts them all back.
 */
export async function moveTasksToGtdNotes(
    app: App,
    settings: RonaldSettings,
    file: TFile,
    editor: Editor,
): Promise<void> {
    // Read now rather than at load, so a changed tag or note needs no reload.
    const byTag = new Map<string, { note: GtdNote; target: TFile | null }>();
    for (const note of GTD_NOTES) {
        const tag = settings[note.tagKey];
        if (tag.length === 0) continue;
        byTag.set(tag, { note, target: app.vault.getFileByPath(settings[note.key]) });
    }
    if (byTag.size === 0) {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- GTD is an acronym
        new Notice('No GTD note has a tag yet; set one in settings');
        return;
    }

    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }

    const targets = new Map<GtdNote, TFile>();
    const result = takeByDestination(text, cache, (tags) => {
        const first = tags.find((tag) => byTag.has(tag));
        if (first === undefined) return undefined;
        const { note, target } = byTag.get(first)!;
        if (!target || target === file) return undefined;
        targets.set(note, target);
        return note;
    });
    if (result.taken.size === 0) {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- GTD is an acronym
        new Notice('No tasks here to move to another GTD note');
        return;
    }

    for (const [note, taken] of result.taken) {
        await appendToNote(app, targets.get(note)!, taken.text);
    }

    const summary = [...result.taken]
        .map(([note, taken]) => `${taken.moved} to ${note.name}`)
        .join(', ');

    // Edits while writing would be overwritten; the tasks are in their notes already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied ${summary} but left them here too`);
        return;
    }
    const origin = editor.getCursor('from');
    replaceChanged(editor, result.text);
    restoreCursor(editor, origin);
    new Notice(`Moved tasks: ${summary}`);
}
