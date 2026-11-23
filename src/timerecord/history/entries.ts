import { LINK_RE, TAG_RE, tagsOnLine } from '../../shared/markdown';
import { gapSeconds, tookSeconds } from './durations';
import { dayTimes } from './order';
import type { TimeRecord } from './parsedays';
import type { PlacedDay } from './placedays';

/** One record as the history shows it. */
export interface HistoryEntry {
    record: TimeRecord;
    day: PlacedDay;
    /** Seconds since the midnight the day began after; more than a day's worth past the next one. */
    dayTime: number;
    /**
     * Whether the record breaks the order of its day (see `dayTimes`). It then
     * has no durations, and the record above it has no time to it.
     */
    outOfOrder: boolean;
    /** The record's tags, lower case and without `#`. */
    tags: string[];
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
 * change how long this one lasted. It never runs from one day into the next,
 * nor from or to a record that is out of order.
 */
export function historyEntries(days: readonly PlacedDay[]): HistoryEntry[] {
    return days
        .flatMap((day) => {
            const times = dayTimes(day.records);
            return day.records.map((record, index): HistoryEntry => {
                const { seconds, outOfOrder } = times[index]!;
                const next = times[index + 1];
                const hasGap = !outOfOrder && next !== undefined && !next.outOfOrder;
                return {
                    record,
                    day,
                    dayTime: seconds,
                    outOfOrder,
                    tags: tagsOnLine(record.text),
                    took: outOfOrder ? null : tookSeconds(record),
                    untilNext: hasGap ? gapSeconds(seconds, next.seconds) : null,
                };
            });
        })
        .reverse();
}

/**
 * The time recorded in `entries`: each one's explicit end where it has one,
 * otherwise the time to the next record of its day. The last record of a day
 * adds nothing, so a total never runs across a day's end.
 */
export function totalSeconds(entries: readonly HistoryEntry[]): number {
    return entries.reduce((sum, { took, untilNext }) => sum + (took ?? untilNext ?? 0), 0);
}

/** A record's text as it reads: each wikilink as its display text or its target. */
export function readableText(text: string): string {
    return text.replace(LINK_RE, (_link, target: string, display?: string) =>
        (display ?? target).trim(),
    );
}

/** A stretch of a record's text, and whether it is a tag. */
export interface TextPart {
    text: string;
    tag: boolean;
}

/** `text` cut into its tags ("#werk") and the plain text around them, in order. */
export function textParts(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let from = 0;
    for (const match of text.matchAll(TAG_RE)) {
        if (match.index > from) parts.push({ text: text.slice(from, match.index), tag: false });
        parts.push({ text: match[0], tag: true });
        from = match.index + match[0].length;
    }
    if (from < text.length) parts.push({ text: text.slice(from), tag: false });
    return parts;
}
