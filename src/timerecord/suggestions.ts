import { readableText } from './history/entries';
import { splitTags } from './recordtags';

/** Something recorded before, offered while typing a new record. */
export interface PastRecord {
    /** The text as it goes back into the field, without the tags that have a chip. */
    text: string;
    /** The text as shown and matched: each wikilink as it reads. */
    label: string;
    /** The tags with a chip it had the last time, lower case and without `#`. */
    tags: string[];
    /** How often it was recorded, the recent times counting for more. */
    score: number;
}

/**
 * After this many records an occurrence counts for half as much: something
 * done often months ago gives way to what is done now, but a regular thing
 * still outranks a one-off from yesterday.
 */
const HALF_LIFE = 250;

/** How many suggestions are shown at most. */
export const MAX_SUGGESTIONS = 5;

/**
 * Every distinct thing recorded, from `texts` (the records' texts, the latest
 * first), the most used first.
 *
 * Records are the same when their text is, ignoring case, spacing and the
 * tags in `known`; the most recent one's spelling and tags are kept.
 */
export function pastRecords(texts: readonly string[], known: ReadonlySet<string>): PastRecord[] {
    const byKey = new Map<string, PastRecord>();
    texts.forEach((raw, index) => {
        const { text, tags } = splitTags(raw, known);
        if (text.length === 0) return;
        const weight = 0.5 ** (index / HALF_LIFE);
        const key = text.toLowerCase();
        const seen = byKey.get(key);
        if (seen) seen.score += weight;
        else byKey.set(key, { text, label: readableText(text), tags, score: weight });
    });
    return [...byKey.values()].sort((a, b) => b.score - a.score);
}

/** The words of a text, lower case, for matching. */
function wordsOf(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 0);
}

/**
 * The past records that fit what is typed, the most used first: each word of
 * the query must start a word of the record, in any order, so "ov ja" finds
 * "Overleg met Jan". Nothing for an empty query, and nothing that is exactly
 * what was typed already, unless it brings tags along.
 */
export function matchPastRecords(
    records: readonly PastRecord[],
    query: string,
    limit = MAX_SUGGESTIONS,
): PastRecord[] {
    const wanted = wordsOf(query);
    if (wanted.length === 0) return [];
    const typed = query.trim().toLowerCase();

    const matches: PastRecord[] = [];
    for (const record of records) {
        if (record.text.toLowerCase() === typed && record.tags.length === 0) continue;
        const words = wordsOf(record.label);
        if (!wanted.every((part) => words.some((word) => word.startsWith(part)))) continue;
        matches.push(record);
        if (matches.length === limit) break;
    }
    return matches;
}
