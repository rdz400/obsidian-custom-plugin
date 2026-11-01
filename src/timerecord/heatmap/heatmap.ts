/**
 * A record's time as written in the note: hh:mm or hh:mm:ss, a single-digit
 * hour allowed. The hour is group 1.
 */
const TIME = String.raw`([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?`;

/** Text that is a record's time and nothing else, such as inline code's in reading mode. */
const TIME_RE = new RegExp(`^${TIME}$`);

/**
 * A line that opens a record: a list marker, then the time in inline code —
 * "- `08:30:00` Overleg". The marker and the space after it are group 1, the
 * time group 2 and its hour group 3. A time later on the line, such as an
 * explicit end, isn't matched.
 */
const RECORD_LINE_RE = new RegExp(`^(\\s*(?:[-*+]|\\d+[.)])\\s+)\`(${TIME})\``);

/**
 * Where a record's time sits in its line, backticks included, and the hour it
 * falls in. The backticks are part of it so that where the editor shows them,
 * they take the time's colour.
 */
export interface RecordTime {
    /** Offset of the opening backtick. */
    from: number;
    /** Offset just past the closing backtick. */
    to: number;
    hour: number;
}

/** The time a source line opens with, or null when it doesn't open a record. */
export function lineRecordTime(line: string): RecordTime | null {
    const match = RECORD_LINE_RE.exec(line);
    if (!match) return null;
    const from = match[1]!.length;
    return { from, to: from + match[2]!.length + 2, hour: Number(match[3]) };
}

/** The hour of `text` when it is a record's time and nothing else, or null. */
export function timeHour(text: string): number | null {
    const match = TIME_RE.exec(text.trim());
    return match ? Number(match[1]) : null;
}

/** The class every record's time gets, in the editor and in reading mode. */
const TIME_HEAT_CLASS = 'ronald-time-heat';

/**
 * The classes of a time in `hour`: the shared one and one for the hour,
 * "ronald-time-heat ronald-time-heat-08", which `styles.css` gives a colour.
 */
export function heatClasses(hour: number): string {
    return `${TIME_HEAT_CLASS} ${TIME_HEAT_CLASS}-${String(hour).padStart(2, '0')}`;
}
