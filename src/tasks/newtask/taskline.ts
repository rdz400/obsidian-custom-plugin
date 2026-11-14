import { tagsOnLine } from '../../shared/markdown';
import { findEstimate } from '../estimate/estimate';

/** What the "New task" modal collects, before it becomes a line. */
export interface NewTask {
    /** The task's text as typed; it may carry tags or an estimate of its own. */
    text: string;
    /** Tags to add, lower case and without `#`. */
    tags: readonly string[];
    /** A link to the task's project, as the note it goes into should write it. */
    projectLink?: string;
    /** Minutes the task is estimated to take. */
    estimate?: number;
}

/**
 * The task as a line for a task note:
 * "- [ ] Bel Jan [[tuin]] \20 #prio #thuis".
 *
 * The estimate goes after the text and the link and before the tags, the
 * only place it counts as one (see `estimate.ts`). It is left out when the
 * text ends in an estimate already, and so is a tag the text already carries.
 */
export function taskLine({ text, tags, projectLink, estimate }: NewTask): string {
    const parts = [`- [ ] ${text.trim()}`];
    if (projectLink) parts.push(projectLink);
    if (estimate !== undefined && !findEstimate(text)) parts.push(`\\${estimate}`);
    const own = tagsOnLine(text);
    for (const tag of new Set(tags)) {
        if (!own.includes(tag)) parts.push(`#${tag}`);
    }
    return parts.join(' ');
}

/**
 * The tags in a free-text field: separated by spaces or commas, with or
 * without `#`, folded to lower case like the tags in settings.
 */
export function parseTags(input: string): string[] {
    const tags = input
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#+/, '').toLowerCase())
        .filter((tag) => tag.length > 0);
    return [...new Set(tags)];
}

/**
 * The minutes in an estimate field: a whole number, with or without the
 * backslash it is written with in a note. Undefined for an empty field, and
 * null for anything else that isn't a positive whole number.
 */
export function parseEstimate(input: string): number | undefined | null {
    const value = input.trim().replace(/^\\/, '');
    if (value.length === 0) return undefined;
    if (!/^\d+$/.test(value)) return null;
    const minutes = Number(value);
    return minutes > 0 ? minutes : null;
}
