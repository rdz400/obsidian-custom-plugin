import {
    App,
    Platform,
    PluginSettingTab,
    type Setting,
    type SettingDefinitionItem,
} from 'obsidian';

import type { FilterChip } from './filterbar';
import type RonaldPlugin from './main';

export interface RonaldSettings {
    /**
     * Tag chips offered as filters in the task search, in the order they are
     * shown and numbered as Mod+1…Mod+9.
     */
    taskFilterTags: FilterChip[];
}

export const DEFAULT_SETTINGS: RonaldSettings = {
    taskFilterTags: [
        { value: 'nu', type: 'time' },
        { value: 'vandaag', type: 'time' },
        { value: 'week', type: 'time' },
        { value: 'buiten', type: 'context' },
        { value: 'thuis', type: 'context' },
        { value: 'project', type: 'other' },
    ],
};

export class RonaldSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: RonaldPlugin) {
        super(app, plugin);
    }

    private get tags(): FilterChip[] {
        return this.plugin.settings.taskFilterTags;
    }

    /**
     * The tag list, as a declarative `list` so Obsidian supplies the drag
     * handles, delete buttons and add affordance itself.
     *
     * The rows are rendered imperatively rather than with a `control`: a row
     * holds two fields (the tag and its type) where a control gives one, and
     * keeping them on a single row is the point — a tag and its type are one
     * entry, not two parallel lists.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                type: 'list',
                heading: 'Task filter tags',
                cls: 'ronald-setting-tag-list',
                emptyState: 'No filter tags yet.',
                addItem: {
                    name: 'Add tag',
                    action: () => {
                        this.tags.push({ value: '', type: 'other' });
                        void this.save();
                    },
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = this.tags.splice(oldIndex, 1);
                    if (moved) this.tags.splice(newIndex, 0, moved);
                    void this.save();
                },
                onDelete: (index) => {
                    this.tags.splice(index, 1);
                    void this.save();
                },
                items: this.tags.map((chip, index) => ({
                    name: chip.value.length > 0 ? `#${chip.value}` : 'New tag',
                    searchable: false,
                    render: (setting: Setting) => this.renderTagRow(setting, chip, index),
                })),
            },
        ];
    }

    /**
     * One tag entry: the tag itself and the type that styles it.
     *
     * The name column carries the shortcut digit instead of a label, since the
     * tag is already visible in its own field and the position — which is what
     * the digit reflects — is the thing that is otherwise invisible.
     */
    private renderTagRow(setting: Setting, chip: FilterChip, index: number): void {
        setting
            .setName(index < 9 ? `${SHORTCUT_MODIFIER}+${index + 1}` : '')
            .setClass('ronald-setting-tag-row')
            .addText((text) =>
                text
                    .setPlaceholder('Tag')
                    .setValue(chip.value)
                    .onChange((value) => {
                        chip.value = value.trim().replace(/^#/, '').toLowerCase();
                        void this.plugin.saveSettings();
                    }),
            )
            .addText((text) =>
                text
                    .setPlaceholder('Type')
                    .setValue(chip.type)
                    .onChange((value) => {
                        chip.type = value.trim().toLowerCase();
                        void this.plugin.saveSettings();
                    }),
            );
    }

    /** Persist, then rebuild the rows so labels and shortcut hints follow. */
    private async save(): Promise<void> {
        await this.plugin.saveSettings();
        this.update();
    }
}

/** Matches the modifier the filter bar actually listens for. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';
