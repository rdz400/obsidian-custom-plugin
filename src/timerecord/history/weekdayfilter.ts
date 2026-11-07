import type { FilterChip } from '../../shared/ui/filterbar';
import { isoWeekday } from './calendar';
import type { HistoryEntry } from './entries';

/**
 * A chip per weekday, Monday first. A chip's shortcut is its position, so
 * Mod+1 is Monday and Mod+7 Sunday; its value is that same number.
 */
export const WEEKDAY_CHIPS: readonly FilterChip[] = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(
    (label, index) => ({ value: String(index + 1), type: 'weekday', label }),
);

/**
 * True when `entry` falls on one of the `wanted` weekdays, or nothing is wanted.
 *
 * A record has one weekday, so several chips mean any of them. A day whose date
 * isn't known has no weekday, so it only shows without a filter.
 */
export function matchesWeekdays(entry: HistoryEntry, wanted: ReadonlySet<string>): boolean {
    if (wanted.size === 0) return true;

    const { placement } = entry.day;
    return placement.kind !== 'between' && wanted.has(String(isoWeekday(placement.day)));
}
