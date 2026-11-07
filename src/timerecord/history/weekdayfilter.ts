import type { FilterChip } from '../../shared/ui/filterbar';
import { parseValues } from '../../shared/uri';
import { isoWeekday, WEEKDAYS_EN, WEEKDAYS_NL } from './calendar';
import type { HistoryEntry } from './entries';

/**
 * A chip per weekday, Monday first. A chip's shortcut is its position, so
 * Mod+1 is Monday and Mod+7 Sunday; its value is that same number.
 */
export const WEEKDAY_CHIPS: readonly FilterChip[] = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(
    (label, index) => ({ value: String(index + 1), type: 'weekday', label }),
);

/** A chip's value by what a link can call its day: its label, or its full name. */
const CHIP_BY_NAME = new Map<string, string>([
    ...WEEKDAY_CHIPS.map((chip): [string, string] => [chip.label!, chip.value]),
    // The names are indexed Sunday first, and Sunday's chip is the seventh.
    ...[...WEEKDAYS_NL, ...WEEKDAYS_EN].map((name, index): [string, string] => [
        name,
        String(index % 7 || 7),
    ]),
]);

/**
 * The chips a comma-separated `days` parameter asks for: "ma,donderdag,friday".
 *
 * Unknown names are dropped, as with every chip parameter. So are repeats: the
 * chips are toggled, so "ma,maandag" would otherwise switch Monday off again.
 */
export function parseWeekdays(value: string | undefined): string[] {
    const chips = parseValues(value).flatMap((name) => CHIP_BY_NAME.get(name) ?? []);
    return [...new Set(chips)];
}

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
