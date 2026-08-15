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

    /** Tags offered by the "Insert tag at end of line" command, in order. */
    insertTags: string[];

    /**
     * Tags that get a "Remove #tag from all taken notes" command, in order.
     *
     * Each entry becomes its own command so it can be bound to a hotkey; the
     * list is a setting because which tags need clearing changes over time.
     */
    clearTags: string[];
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
    insertTags: ['buiten', 'prio', 'vandaag', 'computer'],
    clearTags: ['vandaag'],
};

export class RonaldSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: RonaldPlugin) {
        super(app, plugin);
    }

    private get tags(): FilterChip[] {
        return this.plugin.settings.taskFilterTags;
    }

    private get insertTags(): string[] {
        return this.plugin.settings.insertTags;
    }

    private get clearTags(): string[] {
        return this.plugin.settings.clearTags;
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
            {
                type: 'list',
                heading: 'Tags to insert at end of line',
                cls: 'ronald-setting-tag-list',
                emptyState: 'No insert tags yet.',
                addItem: {
                    name: 'Add tag',
                    action: () => {
                        this.insertTags.push('');
                        void this.save();
                    },
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = this.insertTags.splice(oldIndex, 1);
                    if (moved !== undefined) this.insertTags.splice(newIndex, 0, moved);
                    void this.save();
                },
                onDelete: (index) => {
                    this.insertTags.splice(index, 1);
                    void this.save();
                },
                items: this.insertTags.map((tag, index) => ({
                    name: tag.length > 0 ? `#${tag}` : 'New tag',
                    searchable: false,
                    render: (setting: Setting) =>
                        this.renderPlainTagRow(setting, this.insertTags, index),
                })),
            },
            {
                type: 'list',
                // Each entry becomes its own command at load time, so a change
                // here needs a plugin reload before the command shows up.
                heading: 'Tags to clear from "taken" notes (reload after changing)',
                cls: 'ronald-setting-tag-list',
                emptyState: 'No tags to clear yet.',
                addItem: {
                    name: 'Add tag',
                    action: () => {
                        this.clearTags.push('');
                        void this.save();
                    },
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = this.clearTags.splice(oldIndex, 1);
                    if (moved !== undefined) this.clearTags.splice(newIndex, 0, moved);
                    void this.save();
                },
                onDelete: (index) => {
                    this.clearTags.splice(index, 1);
                    void this.save();
                },
                items: this.clearTags.map((tag, index) => ({
                    name: tag.length > 0 ? `#${tag}` : 'New tag',
                    searchable: false,
                    render: (setting: Setting) =>
                        this.renderPlainTagRow(setting, this.clearTags, index),
                })),
            },
        ];
    }

    /**
     * One bare-tag entry, used by every list that is just tags. The name column
     * stays empty: unlike the filter chips there is no shortcut tied to the
     * position, and the tag itself is already visible in its field.
     */
    private renderPlainTagRow(setting: Setting, tags: string[], index: number): void {
        setting.setName('').setClass('ronald-setting-tag-row').addText((text) =>
            text
                .setPlaceholder('Tag')
                .setValue(tags[index] ?? '')
                .onChange((value) => {
                    tags[index] = value.trim().replace(/^#/, '').toLowerCase();
                    void this.plugin.saveSettings();
                }),
        );
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
