import type { RecordLine } from '../recordline';

const SECONDS_PER_DAY = 86_400;

/** Where a record falls in its day, read in the note's order. */
export interface DayTime {
    /**
     * Seconds since the midnight the day began after. A record past the next
     * midnight counts on from there: 00:30 on a long day is 86_400 + 1_800.
     */
    seconds: number;
    /** Whether the record breaks the order of its day; see `dayTimes`. */
    outOfOrder: boolean;
}

/**
 * The whole minute of a time. Records are compared by the minute so that "11:05"
 * after "11:05:30" isn't taken for the clock running backwards.
 */
function minuteOf(seconds: number): number {
    return Math.floor(seconds / 60);
}

/**
 * Place each record of one day on that day's clock.
 *
 * Records are written in the order they happen, nested ones included, so each
 * is at least as late as the one above it. A day can run past midnight once: a
 * time earlier than the one above it is then the next morning, as long as it is
 * still earlier than the day's first record, which keeps the day under 24 hours.
 * After that its times have to stay earlier than the first record too.
 *
 * A record that breaks this is out of order: a typo, or a day heading left out.
 * It is compared with the record right above it, out of order or not, so one
 * misplaced record marks one break rather than everything after it.
 */
export function dayTimes(records: readonly RecordLine[]): DayTime[] {
    const first = records[0];
    if (!first) return [];

    const firstMinute = minuteOf(first.start);
    let pastMidnight = false;

    return records.map((record, index) => {
        const minute = minuteOf(record.start);
        const previous = records[index - 1];
        let outOfOrder = false;

        if (previous && minute < minuteOf(previous.start)) {
            if (!pastMidnight && minute < firstMinute) pastMidnight = true;
            else outOfOrder = true;
        } else if (pastMidnight && minute >= firstMinute) {
            outOfOrder = true;
        }

        return {
            seconds: record.start + (pastMidnight ? SECONDS_PER_DAY : 0),
            outOfOrder,
        };
    });
}
