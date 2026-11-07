import { parseRecordLine, type RecordLine } from '../recordline';
import { headingDate, type CalendarDay } from './calendar';

/** One record, and the line of the note it is on. */
export interface TimeRecord extends RecordLine {
    line: number;
}

/** A stretch of a note that is one day, with the date it says it is, if any. */
export interface WrittenDay {
    date: CalendarDay | null;
    records: TimeRecord[];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const RULE_RE = /^-{3,}\s*$/;

/** The first line after the frontmatter, whose `---` lines don't split days. */
function bodyStart(lines: readonly string[]): number {
    if (!RULE_RE.test(lines[0] ?? '')) return 0;
    const close = lines.findIndex((line, index) => index > 0 && RULE_RE.test(line));
    return close + 1;
}

/**
 * The whole minute of a time. Days are compared by the minute so that "11:05"
 * after "11:05:30" isn't taken for the clock running backwards.
 */
function minuteOf(seconds: number): number {
    return Math.floor(seconds / 60);
}

/**
 * Split a time record note into its days, in the order they are written.
 *
 * A new day starts at:
 * - a level 2 heading, or a heading of any level that names a date;
 * - a `---` line, used where a heading was left out;
 * - a top-level record whose time is earlier than the top-level record before
 *   it. The clock doesn't run backwards within a day, so this also catches a
 *   split nobody marked. A forgotten split where the time happens to go forward
 *   can't be told from a long pause.
 *
 * Nested records don't count for that last one. They keep their own time under
 * the record above them and can run past the next top-level record, which then
 * has an earlier time on the same day.
 *
 * A stretch without records is kept only if it has a date, since that still
 * says where the days around it lie. Two `---` in a row, or a `---` right above
 * a heading, are not a day.
 */
export function parseDays(text: string): WrittenDay[] {
    const lines = text.split(/\r?\n/);

    let current: WrittenDay = { date: null, records: [] };
    const days = [current];
    const startDay = (date: CalendarDay | null) => {
        current = { date, records: [] };
        days.push(current);
    };

    for (let line = bodyStart(lines); line < lines.length; line++) {
        const content = lines[line]!;

        if (RULE_RE.test(content)) {
            startDay(null);
            continue;
        }

        const heading = HEADING_RE.exec(content);
        if (heading) {
            const date = headingDate(heading[2]!);
            if (date !== null || heading[1]!.length === 2) startDay(date);
            continue;
        }

        const record = parseRecordLine(content);
        if (!record) continue;

        if (!record.nested) {
            const previous = current.records.filter((earlier) => !earlier.nested).pop();
            if (previous && minuteOf(record.start) < minuteOf(previous.start)) startDay(null);
        }
        current.records.push({ ...record, line });
    }

    return days.filter((day) => day.date !== null || day.records.length > 0);
}
