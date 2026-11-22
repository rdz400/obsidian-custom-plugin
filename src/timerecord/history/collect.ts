import type { App, TFile } from 'obsidian';

import { templateMatcher } from '../../shared/vault';
import { isTimeRecordNote } from '../timerecordnote';
import { historyEntries, type HistoryEntry } from './entries';
import { parseDays } from './parsedays';
import { latestDay, placeDays } from './placedays';

/** A record in the history, and the note it is in. */
export interface NoteEntry extends HistoryEntry {
    note: TFile;
}

/** A line where a note breaks the order of its records or of its dates. */
export interface OrderIssue {
    note: TFile;
    line: number;
}

/** Every record of the history, and where its order is broken. */
export interface TimeHistory {
    entries: NoteEntry[];
    issues: OrderIssue[];
}

/**
 * Every record in every note of type "tijdsregistratie", the latest first, and
 * the lines where a note's records or dates are out of order, top to bottom.
 *
 * Each note is taken on its own: the last record of one note and the first of
 * the next are never one day, and dates are only inferred within a note. Notes
 * are put in order by their latest date, with those without any date last, so
 * archived notes fall in behind the active one wherever they are stored.
 */
export async function collectHistory(app: App): Promise<TimeHistory> {
    // A template of the type holds no records, only the pattern for them.
    const isTemplate = templateMatcher(app);
    const notes = app.vault
        .getMarkdownFiles()
        .filter((file) => !isTemplate(file) && isTimeRecordNote(app, file));

    const histories = await Promise.all(
        notes.map(async (note) => {
            const days = placeDays(parseDays(await app.vault.cachedRead(note)));
            const entries = historyEntries(days).map((entry) => ({ ...entry, note }));
            const lines = [
                ...days.flatMap((day) => (day.outOfOrder && day.line !== null ? [day.line] : [])),
                ...entries.filter((entry) => entry.outOfOrder).map((entry) => entry.record.line),
            ].sort((a, b) => a - b);
            return {
                latest: latestDay(days) ?? -Infinity,
                entries,
                issues: lines.map((line) => ({ note, line })),
            };
        }),
    );

    histories.sort((a, b) => b.latest - a.latest);
    return {
        entries: histories.flatMap(({ entries }) => entries),
        issues: histories.flatMap(({ issues }) => issues),
    };
}
