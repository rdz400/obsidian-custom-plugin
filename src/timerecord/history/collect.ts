import type { App, TFile } from 'obsidian';

import { isTimeRecordNote } from '../timerecordnote';
import { historyEntries, type HistoryEntry } from './entries';
import { parseDays } from './parsedays';
import { latestDay, placeDays } from './placedays';

/** A record in the history, and the note it is in. */
export interface NoteEntry extends HistoryEntry {
    note: TFile;
}

/**
 * Every record in every note of type "tijdsregistratie", the latest first.
 *
 * Each note is taken on its own: the last record of one note and the first of
 * the next are never one day, and dates are only inferred within a note. Notes
 * are put in order by their latest date, with those without any date last, so
 * archived notes fall in behind the active one wherever they are stored.
 */
export async function collectHistory(app: App): Promise<NoteEntry[]> {
    const notes = app.vault.getMarkdownFiles().filter((file) => isTimeRecordNote(app, file));

    const histories = await Promise.all(
        notes.map(async (note) => {
            const days = placeDays(parseDays(await app.vault.cachedRead(note)));
            return {
                latest: latestDay(days) ?? -Infinity,
                entries: historyEntries(days).map((entry) => ({ ...entry, note })),
            };
        }),
    );

    return histories.sort((a, b) => b.latest - a.latest).flatMap(({ entries }) => entries);
}
