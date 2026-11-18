import type { App } from 'obsidian';

import { formatDate } from '../shared/date';

/**
 * Headings that link the daily note of the day, such as `## [[20261118]]`,
 * that moved tasks go under: finished ones in "klaar", leftovers from today in
 * overview.
 */

/** Date format of the daily note when the core "Daily notes" plugin sets none. */
const DEFAULT_DAILY_FORMAT = 'YYYYMMDD';

/** The part of the core plugins Obsidian doesn't document that is read here. */
interface InternalPlugins {
    internalPlugins?: {
        getPluginById(id: string): { instance?: { options?: { format?: unknown } } } | null;
    };
}

/** Date format of the daily note, taken from the core "Daily notes" plugin. */
function dailyNoteFormat(app: App): string {
    const plugins = (app as unknown as InternalPlugins).internalPlugins;
    const format = plugins?.getPluginById('daily-notes')?.instance?.options?.format;
    return typeof format === 'string' && format.length > 0 ? format : DEFAULT_DAILY_FORMAT;
}

/** A link to today's daily note: `[[20261118]]`. */
export function todayLink(app: App): string {
    return `[[${formatDate(new Date(), dailyNoteFormat(app))}]]`;
}

/**
 * What to add to `content` to put `text` at its end under `heading`, a `##`
 * heading. The heading is added, after a blank line, unless the note's last
 * `##` heading is that one already. `text` gets a line of its own and ends with
 * a newline.
 */
export function underHeading(content: string, heading: string, text: string): string {
    const headings = content.match(/^##\s+.*$/gm);
    const last = headings?.[headings.length - 1];
    // Compare loosely so trailing whitespace in the file doesn't force a duplicate.
    if (last?.trim() === heading) {
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        return separator + text + '\n';
    }
    const separator =
        content.length === 0 || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    return `${separator}${heading}\n\n${text}\n`;
}
