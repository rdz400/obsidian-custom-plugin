/**
 * A date without a time: the number of days since 1 January 1970.
 *
 * A plain number makes "the day after" and "how many days between" simple sums,
 * and leaves no time zone or daylight saving to get wrong.
 */
export type CalendarDay = number;

const MS_PER_DAY = 86_400_000;

/** Indexed by `getUTCDay`, so Sunday first. */
const WEEKDAYS_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MONTHS_NL = [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
const MONTHS_EN = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];

/** A month's number by the first three letters of its Dutch or English name. */
const MONTH_BY_PREFIX = new Map(
    [...MONTHS_NL, ...MONTHS_EN].map((name) => [
        name.slice(0, 3),
        (MONTHS_NL.includes(name) ? MONTHS_NL : MONTHS_EN).indexOf(name) + 1,
    ]),
);

/** The date for a year, month (1-12) and day, or null when no such date exists. */
export function calendarDay(year: number, month: number, day: number): CalendarDay | null {
    const ms = Date.UTC(year, month - 1, day);
    const date = new Date(ms);
    const exists =
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
    return exists ? ms / MS_PER_DAY : null;
}

/**
 * The date a heading names, or null when it names none. The daily note link
 * "[[20261104]]" is how it should be written; the other forms are there because
 * not every heading was: "2026-11-04", "4-11-2026", "24 oktober 2026 (zaterdag)".
 */
export function headingDate(heading: string): CalendarDay | null {
    let match = /\b(\d{4})(\d{2})(\d{2})\b/.exec(heading) ?? /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(heading);
    if (match) return calendarDay(Number(match[1]), Number(match[2]), Number(match[3]));

    match = /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/.exec(heading);
    if (match) return calendarDay(Number(match[3]), Number(match[2]), Number(match[1]));

    match = /\b(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})\b/i.exec(heading);
    const month = match && MONTH_BY_PREFIX.get(match[2]!.slice(0, 3).toLowerCase());
    if (match && month) return calendarDay(Number(match[3]), month, Number(match[1]));

    return null;
}

/** The date's parts, for showing and searching it. */
function partsOf(day: CalendarDay): { year: number; month: number; date: number; weekday: number } {
    const utc = new Date(day * MS_PER_DAY);
    return {
        year: utc.getUTCFullYear(),
        month: utc.getUTCMonth(),
        date: utc.getUTCDate(),
        weekday: utc.getUTCDay(),
    };
}

/** The day of the week as a number: Monday is 1, Sunday 7. */
export function isoWeekday(day: CalendarDay): number {
    return partsOf(day).weekday || 7;
}

/** "zaterdag 24 oktober 2026", in the language the notes are written in. */
export function formatDay(day: CalendarDay): string {
    const { year, month, date, weekday } = partsOf(day);
    return `${WEEKDAYS_NL[weekday]} ${date} ${MONTHS_NL[month]} ${year}`;
}

/** "24 oktober 2026", for saying where a day without a date of its own lies. */
export function formatShortDay(day: CalendarDay): string {
    const { year, month, date } = partsOf(day);
    return `${date} ${MONTHS_NL[month]} ${year}`;
}

/**
 * Everything a search can call this date: its weekday and month in Dutch and
 * English, its day of the month, its year, and "20261024" and "2026-10-24".
 */
export function dayWords(day: CalendarDay): string[] {
    const { year, month, date, weekday } = partsOf(day);
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(date).padStart(2, '0');
    return [
        WEEKDAYS_NL[weekday]!,
        WEEKDAYS_EN[weekday]!,
        String(date),
        MONTHS_NL[month]!,
        MONTHS_EN[month]!,
        String(year),
        `${year}${mm}${dd}`,
        `${year}-${mm}-${dd}`,
    ];
}
