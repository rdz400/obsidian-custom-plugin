import { Platform, type Setting, type SettingDefinitionList } from 'obsidian';

import type RonaldPlugin from '../main';

/** What a feature's settings sections need from the settings tab. */
export interface SettingSectionContext {
    plugin: RonaldPlugin;
    /** Persist, then rebuild the rows so labels and shortcut hints follow. */
    save: () => Promise<void>;
}

/** Matches the modifier the filter bar actually listens for. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';

/**
 * The name of a list row whose position is its chip's shortcut: "Cmd+1" for
 * the first row, nothing from the tenth on, where shortcuts stop.
 */
export function shortcutName(index: number): string {
    return index < 9 ? `${SHORTCUT_MODIFIER}+${index + 1}` : '';
}

/** What sets one editable list in the settings apart from the others. */
export interface EditableListOptions<T> {
    heading: string;
    emptyState: string;
    /** The add button's label, such as "Add tag". */
    addName: string;
    /** The setting's array, changed in place and saved after each change. */
    entries: T[];
    /** The entry the add button appends, for the user to fill in. */
    newEntry: () => T;
    /** The row's name, for an entry with an empty value too. */
    itemName: (entry: T) => string;
    /** The row's fields; they save on change themselves. */
    render: (setting: Setting, entry: T, index: number) => void;
}

/**
 * A declarative `list` for one array setting, so Obsidian supplies the drag
 * handles, delete buttons and add affordance itself. Adding, reordering and
 * deleting change `entries` and save; `save` also rebuilds the rows, so the
 * names and shortcut hints follow the new order.
 */
export function editableList<T>(
    save: () => Promise<void>,
    options: EditableListOptions<T>,
): SettingDefinitionList {
    const { entries } = options;
    return {
        type: 'list',
        heading: options.heading,
        cls: 'ronald-setting-tag-list',
        emptyState: options.emptyState,
        addItem: {
            name: options.addName,
            action: () => {
                entries.push(options.newEntry());
                void save();
            },
        },
        onReorder: (oldIndex, newIndex) => {
            const [moved] = entries.splice(oldIndex, 1);
            if (moved !== undefined) entries.splice(newIndex, 0, moved);
            void save();
        },
        onDelete: (index) => {
            entries.splice(index, 1);
            void save();
        },
        items: entries.map((entry, index) => ({
            name: options.itemName(entry),
            searchable: false,
            render: (setting: Setting) => options.render(setting, entry, index),
        })),
    };
}
