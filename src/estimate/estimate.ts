import { isDoneMarker, taskMarker } from '../tasksort/taskline';

/**
 * A time estimate: a backslash and the minutes, as the last word of a task's
 * text — "- [ ] Bel Jan \20 #thuis". Only tags and a block id may follow it,
 * so a backslash and digits elsewhere in the text ("C:\2024") don't count.
 *
 * Markdown leaves a backslash before a digit alone, so the estimate shows as
 * written in every view.
 *
 * Whitespace before it is matched rather than looked behind for, since older
 * iOS webviews reject lookbehind and the plugin would fail to load.
 */
const ESTIMATE_RE = /(^|\s)(\\(\d+))(?=(?:\s+#[^\s#]+)*(?:\s+\^[\w-]+)?\s*$)/;

/** Where an estimate sits in its text, and the minutes it stands for. */
export interface Estimate {
    /** Offset of the backslash. */
    from: number;
    /** Offset just past the last digit. */
    to: number;
    minutes: number;
}

/** The estimate at the end of `text`, which is known to be a task's. */
export function findEstimate(text: string): Estimate | null {
    const match = ESTIMATE_RE.exec(text);
    if (!match) return null;
    const from = match.index + match[1]!.length;
    return {
        from,
        to: from + match[2]!.length,
        minutes: Number(match[3]),
    };
}

/** The estimate of a source line, or null when it isn't a task line or has none. */
export function lineEstimate(line: string): Estimate | null {
    return taskMarker(line) === undefined ? null : findEstimate(line);
}

/** The time the open tasks in a note add up to. */
export interface EstimateTotal {
    minutes: number;
    /** How many open tasks carry an estimate. */
    tasks: number;
}

/**
 * The estimates of every task in `text` that isn't done, added up. Each task
 * counts its own estimate only: a parent's isn't taken to cover its subtasks.
 */
export function openEstimateTotal(text: string): EstimateTotal {
    const total: EstimateTotal = { minutes: 0, tasks: 0 };
    for (const line of text.split('\n')) {
        const marker = taskMarker(line);
        if (marker === undefined || isDoneMarker(marker)) continue;
        const estimate = findEstimate(line);
        if (!estimate) continue;
        total.minutes += estimate.minutes;
        total.tasks++;
    }
    return total;
}

/** Minutes as hours and minutes: "20m", "2h", "1h 35m". */
export function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    if (rest === 0) return `${hours}h`;
    return `${hours}h ${rest}m`;
}

/** The class an estimate is wrapped in, in the editor and in reading mode. */
export const ESTIMATE_CLASS = 'ronald-estimate';
