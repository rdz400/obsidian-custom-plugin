import type { FilterChip } from '../../shared/ui/filterbar';
import type { HistoryEntry } from './entries';

/** A chip per tag, in the order given; Alt+1…9, as the weekday row has Mod. */
export function tagChips(tags: readonly string[]): FilterChip[] {
    return tags.map((value) => ({ value, type: 'tag' }));
}

/**
 * True when `entry` has one of the `wanted` tags, or nothing is wanted. A tag
 * also stands for the tags nested under it, so `werk` finds `#werk/overleg`.
 */
export function matchesTags(entry: HistoryEntry, wanted: ReadonlySet<string>): boolean {
    if (wanted.size === 0) return true;
    return entry.tags.some((tag) =>
        [...wanted].some((want) => tag === want || tag.startsWith(`${want}/`)),
    );
}
