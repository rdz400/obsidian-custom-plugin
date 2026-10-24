/**
 * Naming
 * ======
 *
 * Note file names follow one convention: the date the file was created as
 * YYMMDD, a hyphen, and the name in lower case with hyphens between the words,
 * like "260912-overleg-met-jan". Accents are dropped ("café" becomes "cafe"),
 * and a date already at the start of the name is replaced by the creation
 * date.
 *
 * How to use it
 * -------------
 * - "Apply naming convention to files in a folder" asks for a folder and shows
 *   the renames it would make, for the files directly in that folder.
 *   Nothing is renamed until you confirm. Links to the renamed notes are
 *   updated, and names that would clash get -2, -3 added.
 *
 * Where the code is
 * -----------------
 * - convention.ts    the naming rules, without anything Obsidian-specific
 * - renamefiles.ts   planning and applying the renames
 * - foldermodal.ts   choosing the folder
 * - confirmmodal.ts  confirming the renames
 */

import type { Plugin } from 'obsidian';

import { applyNamingConvention } from './renamefiles';

/** Register the naming command. */
export function registerNaming(plugin: Plugin): void {
    plugin.addCommand({
        id: 'apply-naming-convention',
        name: 'Apply naming convention to files in a folder',
        icon: 'file-pen',
        callback: () => applyNamingConvention(plugin.app),
    });
}
