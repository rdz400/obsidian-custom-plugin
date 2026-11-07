import { dayWords, formatDay, formatShortDay, type CalendarDay } from './calendar';
import type { TimeRecord, WrittenDay } from './parsedays';

/**
 * What is known about when a day was:
 * - `written`: its heading says so;
 * - `inferred`: it has no date, but only one is possible (see `placeDays`);
 * - `between`: it lies somewhere between two dated days, either of which may be
 *   missing.
 */
export type DayPlacement =
    | { kind: 'written' | 'inferred'; day: CalendarDay }
    | { kind: 'between'; after: CalendarDay | null; before: CalendarDay | null };

/** A day of a note, with what is known about its date. */
export interface PlacedDay {
    placement: DayPlacement;
    records: TimeRecord[];
}

/**
 * Where a run of `count` undated days lies, between the dated days around it.
 *
 * When they exactly fill the gap there is only one way to divide the dates. Any
 * other dates would be a guess, so those days only say what they lie between.
 * Dates running backwards say nothing at all.
 */
function placeRun(
    count: number,
    after: CalendarDay | null,
    before: CalendarDay | null,
): DayPlacement[] {
    const bothKnown = after !== null && before !== null;

    if (bothKnown && before - after - 1 === count) {
        return Array.from({ length: count }, (_, index) => ({
            kind: 'inferred',
            day: after + 1 + index,
        }));
    }

    const placement: DayPlacement =
        bothKnown && before <= after
            ? { kind: 'between', after: null, before: null }
            : { kind: 'between', after, before };
    return Array.from({ length: count }, () => placement);
}

/**
 * Work out what can be known about the date of each day in a note.
 *
 * The days are in the note's order, which is taken to be chronological, and no
 * day appears twice. So one undated day between 4 and 6 November can only be
 * the 5th. An undated day before 24 October could be any day before it, because
 * not every day gets records.
 */
export function placeDays(days: readonly WrittenDay[]): PlacedDay[] {
    const placed: PlacedDay[] = [];
    let run: WrittenDay[] = [];
    let after: CalendarDay | null = null;

    const closeRun = (before: CalendarDay | null) => {
        const placements = placeRun(run.length, after, before);
        run.forEach((day, index) => {
            placed.push({ placement: placements[index]!, records: day.records });
        });
        run = [];
    };

    for (const day of days) {
        if (day.date === null) {
            run.push(day);
            continue;
        }
        closeRun(day.date);
        placed.push({ placement: { kind: 'written', day: day.date }, records: day.records });
        after = day.date;
    }
    closeRun(null);

    return placed;
}

/** The latest date `days` mention, or null when none has a date. */
export function latestDay(days: readonly PlacedDay[]): CalendarDay | null {
    let latest: CalendarDay | null = null;
    for (const { placement } of days) {
        if (placement.kind === 'between') continue;
        if (latest === null || placement.day > latest) latest = placement.day;
    }
    return latest;
}

/** How a day is headed in a list: its date, or as much as is known of it. */
export function placementLabel(placement: DayPlacement): string {
    if (placement.kind !== 'between') {
        const date = formatDay(placement.day);
        return placement.kind === 'inferred' ? `~ ${date}` : date;
    }

    const { after, before } = placement;
    if (after !== null && before !== null) {
        return `tussen ${formatShortDay(after)} en ${formatShortDay(before)}`;
    }
    if (before !== null) return `vóór ${formatShortDay(before)}`;
    if (after !== null) return `na ${formatShortDay(after)}`;
    return 'datum onbekend';
}

/** What a search can call the day. Without a known date there is nothing to go on. */
export function placementWords(placement: DayPlacement): string[] {
    return placement.kind === 'between' ? [] : dayWords(placement.day);
}
