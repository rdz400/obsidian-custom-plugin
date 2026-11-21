import type { Setting, SettingDefinitionItem } from 'obsidian';

import type RonaldPlugin from '../main';
import { editableList, shortcutName, type SettingSectionContext } from '../settings/section';

export interface TimeRecordSettings {
    /**
     * Tags offered as chips in the "Add time record" modal, in the order they
     * are shown and numbered as Mod+1…Mod+9. A chip that is on adds its tag at
     * the end of the record's line.
     */
    timeRecordTags: string[];
}

export const DEFAULT_TIME_RECORD_SETTINGS: TimeRecordSettings = {
    timeRecordTags: [],
};

/** The tags of the "Add time record" modal. */
export function timeRecordSettingSections({
    plugin,
    save,
}: SettingSectionContext): SettingDefinitionItem[] {
    const tags = plugin.settings.timeRecordTags;

    return [
        editableList(save, {
            heading: 'Tags to add to a time record',
            emptyState: 'No time record tags yet.',
            addName: 'Add tag',
            entries: tags,
            newEntry: () => '',
            itemName: (tag) => (tag.length > 0 ? `#${tag}` : 'New tag'),
            render: (setting, _tag, index) => renderTagRow(plugin, setting, tags, index),
        }),
    ];
}

/** One tag, numbered by its chip's shortcut in the modal. */
function renderTagRow(plugin: RonaldPlugin, setting: Setting, tags: string[], index: number): void {
    setting
        .setName(shortcutName(index))
        .setClass('ronald-setting-tag-row')
        .addText((text) =>
            text
                .setPlaceholder('Tag')
                .setValue(tags[index] ?? '')
                .onChange((value) => {
                    tags[index] = value.trim().replace(/^#/, '').toLowerCase();
                    void plugin.saveSettings();
                }),
        );
}
