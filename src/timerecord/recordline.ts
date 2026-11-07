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

/** A time in inline code closing the line: the record's explicit end, in group 1. */
const END_TIME_RE = new RegExp(`\\s*\`(${TIME})\`\\s*$`);

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

/** What a record line says. */
export interface RecordLine {
    /** The opening time as written, "08:30:00" or "8:30". */
    time: string;
    /** The opening time in seconds since midnight. */
    start: number;
    /** The explicit end in seconds since midnight, or null when there is none. */
    end: number | null;
    /** What the record is about: the rest of the line, without the end time. */
    text: string;
    /** Whether the line is indented, under a record above it. */
    nested: boolean;
}

/** Read a record line, or null when the line doesn't open a record. */
export function parseRecordLine(line: string): RecordLine | null {
    const position = lineRecordTime(line);
    if (!position) return null;

    const time = line.slice(position.from + 1, position.to - 1);
    const rest = line.slice(position.to);
    const end = END_TIME_RE.exec(rest);

    return {
        time,
        start: clockSeconds(time),
        end: end ? clockSeconds(end[1]!) : null,
        text: (end ? rest.slice(0, end.index) : rest).trim(),
        nested: /^\s/.test(line),
    };
}

/** Seconds since midnight of a time already known to be valid. */
function clockSeconds(time: string): number {
    const [hours = 0, minutes = 0, seconds = 0] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}
