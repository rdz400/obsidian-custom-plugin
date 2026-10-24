import type { Setting, SettingDefinitionItem } from 'obsidian';

import type RonaldPlugin from '../main';
import { shortcutName, type SettingSectionContext } from '../settings/section';

export interface NavigationSettings {
    /**
     * Folders offered as filter chips in the recent notes list, in the order
     * their chips are shown and numbered as Mod+1…Mod+9.
     *
     * A chip matches the folder and everything under it, so "1-projecten" also
     * covers "1-projecten/archief". The bar adds an "overige" chip itself for
     * every folder without one.
     */
    recentFolders: string[];
}

export const DEFAULT_NAVIGATION_SETTINGS: NavigationSettings = {
    recentFolders: ['0-inbox', '9-begrippen', '2-gebieden-ref', '1-projecten'],
};

/** The folders the recent notes list filters on. */
export function navigationSettingSections({
    plugin,
    save,
}: SettingSectionContext): SettingDefinitionItem[] {
    const recentFolders = plugin.settings.recentFolders;

    return [
        {
            type: 'list',
            // The bar adds "overige" itself, after these, so every note in
            // the list is reachable by some chip.
            heading: 'Folders to filter recent notes on (plus "overige")',
            cls: 'ronald-setting-tag-list',
            emptyState: 'No folders yet.',
            addItem: {
                name: 'Add folder',
                action: () => {
                    recentFolders.push('');
                    void save();
                },
            },
            onReorder: (oldIndex, newIndex) => {
                const [moved] = recentFolders.splice(oldIndex, 1);
                if (moved !== undefined) recentFolders.splice(newIndex, 0, moved);
                void save();
            },
            onDelete: (index) => {
                recentFolders.splice(index, 1);
                void save();
            },
            items: recentFolders.map((folder, index) => ({
                name: folder.length > 0 ? folder : 'New folder',
                searchable: false,
                render: (setting: Setting) => renderFolderRow(plugin, setting, recentFolders, index),
            })),
        },
    ];
}

/**
 * One folder entry. Numbered like the filter tags, since the position
 * decides the chip's shortcut in the recent notes list the same way.
 */
function renderFolderRow(
    plugin: RonaldPlugin,
    setting: Setting,
    recentFolders: string[],
    index: number,
): void {
    setting
        .setName(shortcutName(index))
        .setClass('ronald-setting-tag-row')
        .addText((text) =>
            text
                .setPlaceholder('Folder')
                .setValue(recentFolders[index] ?? '')
                .onChange((value) => {
                    // Trailing slashes would break the prefix match the
                    // chip does, so they are dropped on the way in.
                    recentFolders[index] = value.trim().replace(/\/+$/, '');
                    void plugin.saveSettings();
                }),
        );
}
