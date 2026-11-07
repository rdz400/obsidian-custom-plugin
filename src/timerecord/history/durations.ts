import type { RecordLine } from '../recordline';

const SECONDS_PER_DAY = 86_400;

/**
 * How long a record took, by its explicit end, or null when it has none. An end
 * earlier than the start means it ran past midnight.
 */
export function tookSeconds({ start, end }: RecordLine): number | null {
    if (end === null) return null;
    return end >= start ? end - start : end + SECONDS_PER_DAY - start;
}

/**
 * The time from a record to the next one on the same day, or null when it is
 * the day's last. Also null when the next one has an earlier time, as the record
 * after the last nested one can have; see `parseDays`.
 */
export function gapSeconds(record: RecordLine, next: RecordLine | undefined): number | null {
    if (!next || next.start < record.start) return null;
    return next.start - record.start;
}

/**
 * A duration to the second: "45s", "5m33s", "1h5m33s". Zero parts at the end are
 * left out, so a round duration stays short: "5m", "2h", "1h5m". One in the
 * middle stays, to show what the seconds follow: "1h0m33s".
 */
export function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (s > 0) {
        if (h > 0) return `${h}h${m}m${s}s`;
        return m > 0 ? `${m}m${s}s` : `${s}s`;
    }
    if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
    return m > 0 ? `${m}m` : '0s';
}
