import { App, TFile, setIcon } from 'obsidian';

import { FilterChip } from './filterbar';

/**
 * The frontmatter `type` values worth calling out in a search list, in the
 * order their chips are shown and numbered.
 *
 * Every other type is still read and shown as a plain pill; only these get an
 * icon, a colour and a filter chip, because these are the ones the vault is
 * organised around.
 */
export const MARKED_NOTE_TYPES = [
    'project',
    'taken',
    'dagnotitie',
    'boek',
    'persoon',
] as const;

/** Lucide icon per marked note type; used for the type pill. */
export const TYPE_ICONS: Record<string, string> = {
    project: 'folder',
    taken: 'list-checks',
    dagnotitie: 'calendar-days',
    boek: 'book',
    persoon: 'user',
};

/**
 * Chips for the marked types, offered as a filter row in both link searches.
 *
 * The `type` is the chip's presentational grouping rather than the note type it
 * filters on: all five are one group, keyed by `.ronald-task-filter-type-note`
 * in `styles.css`, since they are alternatives to one another.
 */
export const NOTE_TYPE_FILTERS: FilterChip[] = MARKED_NOTE_TYPES.map((value) => ({
    value,
    type: 'note',
    label: value,
}));

/** The frontmatter `type` of a note, or '' when it has none. */
export function noteType(app: App, file: TFile): string {
    const type: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.type;
    return typeof type === 'string' ? type : '';
}

/**
 * Draw the type pill for a row, into the element that holds the row's title.
 *
 * Nothing is drawn for a note without a type: an empty pill would be a box of
 * background colour saying nothing. An unmarked type still gets its pill, in
 * the neutral styling `.ronald-backlink-type` carries by default.
 */
export function renderTypePill(title: HTMLElement, type: string): void {
    if (!type) return;

    const pill = title.createSpan({
        cls: `ronald-backlink-type ronald-backlink-type-${type}`,
    });
    const icon = TYPE_ICONS[type];
    if (icon) setIcon(pill.createSpan(), icon);
    pill.createSpan({ text: type });
}

/**
 * True when `type` is one of `wanted`, or nothing is wanted at all.
 *
 * A note has exactly one type, so the chips are OR'd rather than AND'd: turning
 * on "project" and "boek" shows notes of either type, where an AND across them
 * could only ever match nothing.
 */
export function matchesNoteType(type: string, wanted: ReadonlySet<string>): boolean {
    return wanted.size === 0 || wanted.has(type);
}
