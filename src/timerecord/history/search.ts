import type { HistoryEntry } from './entries';
import { placementWords, type PlacedDay } from './placedays';

/**
 * True when a search word names `word` by its start: "za" and "zaterdag" find
 * "zaterdag", but "dag" doesn't find every day of the week. One character is
 * only enough for the whole word, so "4" finds the 4th and not every year.
 */
function namesWord(search: string, word: string): boolean {
    return word === search || (search.length >= 2 && word.startsWith(search));
}

/**
 * A search over `entries`. The query's words must all match, each anywhere in a
 * record's text (link targets included), or at the start of its time or of what
 * its date can be called. So "overleg maandag" is the meetings on Mondays, and
 * "okt 2026 lunch" the lunches of that month.
 *
 * What each entry is searched on is prepared up front, once, as it runs on every
 * key press over the whole history.
 */
export function recordSearch<T extends HistoryEntry>(entries: readonly T[]): (query: string) => T[] {
    const wordsOfDay = new Map<PlacedDay, string[]>();
    const prepared = entries.map((entry) => {
        let dayWords = wordsOfDay.get(entry.day);
        if (!dayWords) {
            dayWords = placementWords(entry.day.placement);
            wordsOfDay.set(entry.day, dayWords);
        }
        return {
            entry,
            text: entry.record.text.toLowerCase(),
            words: [...dayWords, entry.record.time],
        };
    });

    return (query) => {
        const searches = query.toLowerCase().split(/\s+/).filter(Boolean);
        return prepared
            .filter(({ text, words }) =>
                searches.every(
                    (search) =>
                        text.includes(search) || words.some((word) => namesWord(search, word)),
                ),
            )
            .map(({ entry }) => entry);
    };
}

/**
 * The entries that open a day in `entries`, in which the entries of one day sit
 * together. In a filtered list that needn't be the day's first record.
 */
export function firstOfEachDay<T extends HistoryEntry>(entries: readonly T[]): Set<T> {
    return new Set(entries.filter((entry, index) => entry.day !== entries[index - 1]?.day));
}
