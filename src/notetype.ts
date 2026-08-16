import { App, TFile, setIcon } from 'obsidian';

import { FilterChip } from './filterbar';

/**
 * One frontmatter `type` worth calling out in a search list: the value as it is
 * written in the frontmatter, and the Lucide icon its pill and chip carry.
 *
 * Configured in the settings, so which types the vault is organised around can
 * change without a code change. Every other type is still read and shown as a
 * plain pill; only these get an icon, a colour and a filter chip.
 */
export interface NoteTypeSetting {
    /** The frontmatter `type` value, lowercase as it is written in a note. */
    value: string;
    /** Lucide icon name for the pill and chip; '' for a pill without one. */
    icon: string;
}

/**
 * The chip value standing for "none of the other chips": a note whose type is
 * blank or unconfigured, a link to a note that does not exist yet, and a link
 * that leaves the vault altogether.
 *
 * Spelled with a trailing colon so no frontmatter `type` can collide with it —
 * a type is a bare word, and a note literally typed "overige" is then still
 * matched by its own chip if one is configured for it, and by this one if not.
 */
export const OTHER_TYPE_FILTER = 'overige:';

/** The chip standing for every type without one of its own. */
const OTHER_TYPE_CHIP: FilterChip = {
    value: OTHER_TYPE_FILTER,
    type: 'other-note',
    label: 'overige',
};

/**
 * Chips for the configured types, offered as a filter row in both link
 * searches, with "overige" last as the catch-all for everything else.
 *
 * The chip `type` is the presentational grouping rather than the note type it
 * filters on: the configured ones are all one group, keyed by
 * `.ronald-task-filter-type-note` in `styles.css`, since they are alternatives
 * to one another. "overige" gets its own so it reads as the leftover bucket it
 * is rather than as another type of note.
 *
 * A row left blank in the settings is dropped: it would offer a chip that
 * matches nothing and eat one of the nine shortcut digits.
 */
export function noteTypeFilters(types: readonly NoteTypeSetting[]): FilterChip[] {
    const chips: FilterChip[] = types
        .filter(({ value }) => value.trim() !== '')
        .map(({ value }) => ({ value: value.trim(), type: 'note', label: value.trim() }));

    return [...chips, OTHER_TYPE_CHIP];
}

/** The frontmatter `type` of a note, or '' when it has none. */
export function noteType(app: App, file: TFile): string {
    const type: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.type;
    return typeof type === 'string' ? type : '';
}

/**
 * Draw the type pill for a row, into the element that holds the row's title.
 *
 * Nothing is drawn for a note without a type: an empty pill would be a box of
 * background colour saying nothing. An unconfigured type still gets its pill,
 * in the neutral styling `.ronald-backlink-type` carries by default.
 *
 * `types` decides the icon: a configured type is drawn with the icon it was
 * given, and colour comes from `styles.css`, which keys off the type name.
 */
export function renderTypePill(
    title: HTMLElement,
    type: string,
    types: readonly NoteTypeSetting[] = [],
): void {
    if (!type) return;

    const pill = title.createSpan({
        cls: `ronald-backlink-type ronald-backlink-type-${type}`,
    });
    const icon = types.find((t) => t.value === type)?.icon;
    if (icon) setIcon(pill.createSpan(), icon);
    pill.createSpan({ text: type });
}

/**
 * The chip a note's type answers to: its own type when that has a chip, and
 * "overige" when it does not — including a note with no type at all.
 *
 * `configured` is the set of type values that have a chip of their own, so a
 * type only falls through to "overige" when nothing else claims it.
 */
export function noteTypeFilterValue(
    type: string,
    configured: ReadonlySet<string>,
): string {
    return configured.has(type) ? type : OTHER_TYPE_FILTER;
}

/**
 * The type values that have a chip of their own, for `noteTypeFilterValue`.
 *
 * Built from the same list the chips are, so a type dropped from the settings
 * stops claiming its notes and they fall into "overige" instead.
 */
export function configuredTypes(types: readonly NoteTypeSetting[]): Set<string> {
    return new Set(
        types.map(({ value }) => value.trim()).filter((value) => value !== ''),
    );
}

/**
 * True when `type` is one of `wanted`, or nothing is wanted at all.
 *
 * A note has exactly one type, so the chips are OR'd rather than AND'd: turning
 * on "project" and "boek" shows notes of either type, where an AND across them
 * could only ever match nothing. A type with no chip of its own answers to
 * "overige", so every note is reachable by some chip.
 */
export function matchesNoteType(
    type: string,
    wanted: ReadonlySet<string>,
    configured: ReadonlySet<string>,
): boolean {
    return wanted.size === 0 || wanted.has(noteTypeFilterValue(type, configured));
}
