import { App, Notice, TFile } from 'obsidian';

import { openFileFromSearch } from '../ui/openfile';

/** The note every time record is written to. */
export const TIME_RECORD_NOTE = 'tijdsregistratie';

/**
 * The time record note, or null — with a notice saying so — when the vault has
 * none.
 *
 * Resolved the way `[[tijdsregistratie]]` is, so the note can live in any folder
 * and moving it needs no change here.
 */
export function getTimeRecordNote(app: App): TFile | null {
    const note = app.metadataCache.getFirstLinkpathDest(TIME_RECORD_NOTE, '');
    if (!note) new Notice(`Note "${TIME_RECORD_NOTE}" not found`);
    return note;
}

/**
 * Open the time record note at its last line, where the latest record is.
 */
export async function openTimeRecordNote(app: App): Promise<void> {
    const note = getTimeRecordNote(app);
    if (!note) return;

    // The line goes to `openFile` as ephemeral state, the same way the task and
    // outline searches jump to a line: the view lands there as it opens, so the
    // note never paints at the top first. The line count comes from the file,
    // since there is no editor to ask until the note is open.
    const text = await app.vault.cachedRead(note);
    const line = text.split('\n').length - 1;

    openFileFromSearch(app, note, undefined, {
        // Live preview, whatever mode the note was last left in: that is
        // `source` with `source: false` — "source" here means the editor rather
        // than reading view, and the flag turns off raw markdown within it.
        state: { mode: 'source', source: false },
        eState: { line, cursor: { from: { line, ch: 0 } } },
    });
}
