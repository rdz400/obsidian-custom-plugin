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
 * The time from a record to the next one on the same day, both in seconds on
 * the day's clock (see `dayTimes`), so it runs on past midnight. Null when there
 * is no next one, and when the next one is a few seconds earlier: records are
 * in order by the minute, as a time can be written without seconds.
 */
export function gapSeconds(from: number, to: number | undefined): number | null {
    if (to === undefined || to < from) return null;
    return to - from;
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
