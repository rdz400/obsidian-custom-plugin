import type { FilterChip } from '../../shared/ui/filterbar';
import type { HistoryEntry } from './entries';

/** Seconds on the day's clock where the afternoon starts. */
const NOON = 12 * 3600;

/**
 * Chips for the time of day, split at noon. They follow the weekday chips in
 * the same row, so Mod+8 is before noon and Mod+9 from noon on.
 */
export const DAYPART_CHIPS: readonly FilterChip[] = [
    { value: 'am', type: 'time', label: '<12' },
    { value: 'pm', type: 'time', label: '≥12' },
];

/**
 * True when `entry` starts in one of the `wanted` parts of the day, or nothing
 * is wanted. It goes by the day's clock, so a record after midnight on a long
 * day is still that day's evening, after noon.
 */
export function matchesDayparts(entry: HistoryEntry, wanted: ReadonlySet<string>): boolean {
    if (wanted.size === 0) return true;
    return wanted.has(entry.dayTime < NOON ? 'am' : 'pm');
}
