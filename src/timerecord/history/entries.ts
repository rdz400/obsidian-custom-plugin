import { LINK_RE } from '../../shared/markdown';
import { gapSeconds, tookSeconds } from './durations';
import type { TimeRecord } from './parsedays';
import type { PlacedDay } from './placedays';

/** One record as the history shows it. */
export interface HistoryEntry {
    record: TimeRecord;
    day: PlacedDay;
    /** How long the record took by its explicit end, or null without one. */
    took: number | null;
    /** The time to the next record of the same day, or null for the day's last. */
    untilNext: number | null;
}

/**
 * The records of a note for the history, the latest first, so a search opens on
 * what happened last.
 *
 * The time to the next record is worked out here, in the note's own order and
 * before anything is filtered: a search that hides the next record doesn't
 * change how long this one lasted.
 */
export function historyEntries(days: readonly PlacedDay[]): HistoryEntry[] {
    return days
        .flatMap((day) =>
            day.records.map((record, index) => ({
                record,
                day,
                took: tookSeconds(record),
                untilNext: gapSeconds(record, day.records[index + 1]),
            })),
        )
        .reverse();
}

/** A record's text as it reads: each wikilink as its display text or its target. */
export function readableText(text: string): string {
    return text.replace(LINK_RE, (_link, target: string, display?: string) =>
        (display ?? target).trim(),
    );
}
