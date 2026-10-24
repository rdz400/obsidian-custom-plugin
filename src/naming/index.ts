import type { Plugin } from 'obsidian';

import { applyNamingConvention } from './renamefiles';

/** Renaming the files in a folder to the naming convention. */
export function registerNaming(plugin: Plugin): void {
    plugin.addCommand({
        id: 'apply-naming-convention',
        name: 'Apply naming convention to files in a folder',
        icon: 'file-pen',
        callback: () => applyNamingConvention(plugin.app),
    });
}
