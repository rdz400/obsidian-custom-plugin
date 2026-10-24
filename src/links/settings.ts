import type { Setting, SettingDefinitionItem } from 'obsidian';

import type RonaldPlugin from '../main';
import { shortcutName, type SettingSectionContext } from '../settings/section';
import type { NoteTypeSetting } from '../shared/ui/notetype';

export interface LinkSettings {
    /**
     * Frontmatter `type` values called out in the two link searches, in the
     * order their chips are shown and numbered.
     *
     * These get an icon, a colour and a filter chip; every other type is still
     * shown as a plain pill and is filtered by the "overige" chip, which the
     * bar adds after these.
     */
    linkNoteTypes: NoteTypeSetting[];
}

export const DEFAULT_LINK_SETTINGS: LinkSettings = {
    linkNoteTypes: [
        { value: 'project', icon: 'folder' },
        { value: 'taken', icon: 'list-checks' },
        { value: 'dagnotitie', icon: 'calendar-days' },
        { value: 'boek', icon: 'book' },
        { value: 'persoon', icon: 'user' },
    ],
};

/** The note types the link searches, and the recent notes list, filter on. */
export function linkSettingSections({ plugin, save }: SettingSectionContext): SettingDefinitionItem[] {
    const noteTypes = plugin.settings.linkNoteTypes;

    return [
        {
            type: 'list',
            // The bar adds "overige" itself, after these; saying so here
            // keeps it from reading as a type someone forgot to add. The
            // icon field takes any Lucide name.
            heading: 'Note types to filter links on (plus "overige")',
            cls: 'ronald-setting-tag-list',
            emptyState: 'No note types yet.',
            addItem: {
                name: 'Add type',
                action: () => {
                    noteTypes.push({ value: '', icon: '' });
                    void save();
                },
            },
            onReorder: (oldIndex, newIndex) => {
                const [moved] = noteTypes.splice(oldIndex, 1);
                if (moved) noteTypes.splice(newIndex, 0, moved);
                void save();
            },
            onDelete: (index) => {
                noteTypes.splice(index, 1);
                void save();
            },
            items: noteTypes.map((type, index) => ({
                name: type.value.length > 0 ? type.value : 'New type',
                searchable: false,
                render: (setting: Setting) => renderNoteTypeRow(plugin, setting, type, index),
            })),
        },
    ];
}

/**
 * One note type: the frontmatter value and the icon its pill carries.
 *
 * Numbered like the task filter tags, since the position decides the chip's
 * shortcut in the link searches the same way.
 */
function renderNoteTypeRow(
    plugin: RonaldPlugin,
    setting: Setting,
    type: NoteTypeSetting,
    index: number,
): void {
    setting
        .setName(shortcutName(index))
        .setClass('ronald-setting-tag-row')
        .addText((text) =>
            text
                .setPlaceholder('Type')
                .setValue(type.value)
                .onChange((value) => {
                    type.value = value.trim().toLowerCase();
                    void plugin.saveSettings();
                }),
        )
        .addText((text) =>
            text
                .setPlaceholder('Icon')
                .setValue(type.icon)
                .onChange((value) => {
                    type.icon = value.trim();
                    void plugin.saveSettings();
                }),
        );
}
