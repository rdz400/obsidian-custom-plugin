import { TFile } from 'obsidian';

import { FilterChip } from './filterbar';

/**
 * The chip value standing for "in none of the configured folders".
 *
 * Spelled with a trailing slash so no real folder can collide with it: a folder
 * path never ends in one, since `renderFolderRow` strips trailing slashes and
 * Obsidian's own paths carry none.
 */
export const OTHER_FOLDER_FILTER = 'overige/';

/**
 * Chips for the configured folders, with "overige" last as the catch-all.
 *
 * A row left blank in the settings is dropped: it would offer a chip matching
 * everything (every path starts with '') and eat one of the nine shortcut
 * digits.
 */
export function folderFilters(folders: readonly string[]): FilterChip[] {
    const chips: FilterChip[] = folders
        .map((folder) => folder.trim().replace(/\/+$/, ''))
        .filter((folder) => folder !== '')
        .map((folder) => ({ value: folder, type: 'folder', label: folder }));

    return [...chips, { value: OTHER_FOLDER_FILTER, type: 'other-folder', label: 'overige' }];
}

/**
 * True when `file` sits in `folder` or anywhere beneath it.
 *
 * Subfolders count: notes in this vault nest ("1-projecten/archief/2026"), so a
 * chip for "1-projecten" that matched only its immediate children would miss
 * most of what lives under it. The boundary is checked with a trailing slash so
 * "1-projecten" never claims a sibling folder like "1-projecten-ref".
 */
export function fileInFolder(file: TFile, folder: string): boolean {
    const path = file.parent?.path ?? '';
    return path === folder || path.startsWith(`${folder}/`);
}

/**
 * The chip a note answers to: the first configured folder containing it, and
 * "overige" when none does.
 *
 * The first match wins rather than the longest, so nesting one configured folder
 * inside another gives the note to whichever chip is listed first — the order in
 * the settings decides, which is a thing the user can see and change.
 */
export function folderFilterValue(file: TFile, folders: readonly string[]): string {
    return folders.find((folder) => fileInFolder(file, folder)) ?? OTHER_FOLDER_FILTER;
}

/**
 * True when `file` is in one of `wanted`, or nothing is wanted at all.
 *
 * A note sits in exactly one place, so the chips are OR'd rather than AND'd:
 * turning on two folders shows notes from either, where an AND could only ever
 * match nothing.
 */
export function matchesFolder(
    file: TFile,
    wanted: ReadonlySet<string>,
    folders: readonly string[],
): boolean {
    return wanted.size === 0 || wanted.has(folderFilterValue(file, folders));
}

