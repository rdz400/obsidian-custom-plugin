import {
    App,
    Platform,
    PluginSettingTab,
    type Setting,
    type SettingDefinitionItem,
} from 'obsidian';

import type { FilterChip } from './filterbar';
import type RonaldPlugin from './main';
import type { NoteTypeSetting } from './notetype';

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

    /**
     * Frontmatter `type` values called out in the two link searches, in the
     * order their chips are shown and numbered.
     *
     * These get an icon, a colour and a filter chip; every other type is still
     * shown as a plain pill and is filtered by the "overige" chip, which the
     * bar adds after these.
     */
    linkNoteTypes: NoteTypeSetting[];

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
    linkNoteTypes: [
        { value: 'project', icon: 'folder' },
        { value: 'taken', icon: 'list-checks' },
        { value: 'dagnotitie', icon: 'calendar-days' },
        { value: 'boek', icon: 'book' },
        { value: 'persoon', icon: 'user' },
    ],
    recentFolders: ['0-inbox', '9-begrippen', '2-gebieden-ref', '1-projecten'],
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

    private get noteTypes(): NoteTypeSetting[] {
        return this.plugin.settings.linkNoteTypes;
    }

    private get recentFolders(): string[] {
        return this.plugin.settings.recentFolders;
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
                        this.noteTypes.push({ value: '', icon: '' });
                        void this.save();
                    },
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = this.noteTypes.splice(oldIndex, 1);
                    if (moved) this.noteTypes.splice(newIndex, 0, moved);
                    void this.save();
                },
                onDelete: (index) => {
                    this.noteTypes.splice(index, 1);
                    void this.save();
                },
                items: this.noteTypes.map((type, index) => ({
                    name: type.value.length > 0 ? type.value : 'New type',
                    searchable: false,
                    render: (setting: Setting) => this.renderNoteTypeRow(setting, type, index),
                })),
            },
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
                        this.recentFolders.push('');
                        void this.save();
                    },
                },
                onReorder: (oldIndex, newIndex) => {
                    const [moved] = this.recentFolders.splice(oldIndex, 1);
                    if (moved !== undefined) this.recentFolders.splice(newIndex, 0, moved);
                    void this.save();
                },
                onDelete: (index) => {
                    this.recentFolders.splice(index, 1);
                    void this.save();
                },
                items: this.recentFolders.map((folder, index) => ({
                    name: folder.length > 0 ? folder : 'New folder',
                    searchable: false,
                    render: (setting: Setting) =>
                        this.renderFolderRow(setting, index),
                })),
            },
        ];
    }

    /**
     * One folder entry. Numbered like the filter tags, since the position
     * decides the chip's shortcut in the recent notes list the same way.
     */
    private renderFolderRow(setting: Setting, index: number): void {
        setting
            .setName(index < 9 ? `${SHORTCUT_MODIFIER}+${index + 1}` : '')
            .setClass('ronald-setting-tag-row')
            .addText((text) =>
                text
                    .setPlaceholder('Folder')
                    .setValue(this.recentFolders[index] ?? '')
                    .onChange((value) => {
                        // Trailing slashes would break the prefix match the
                        // chip does, so they are dropped on the way in.
                        this.recentFolders[index] = value.trim().replace(/\/+$/, '');
                        void this.plugin.saveSettings();
                    }),
            );
    }

    /**
     * One note type: the frontmatter value and the icon its pill carries.
     *
     * Numbered like the task filter tags, since the position decides the chip's
     * shortcut in the link searches the same way.
     */
    private renderNoteTypeRow(
        setting: Setting,
        type: NoteTypeSetting,
        index: number,
    ): void {
        setting
            .setName(index < 9 ? `${SHORTCUT_MODIFIER}+${index + 1}` : '')
            .setClass('ronald-setting-tag-row')
            .addText((text) =>
                text
                    .setPlaceholder('Type')
                    .setValue(type.value)
                    .onChange((value) => {
                        type.value = value.trim().toLowerCase();
                        void this.plugin.saveSettings();
                    }),
            )
            .addText((text) =>
                text
                    .setPlaceholder('Icon')
                    .setValue(type.icon)
                    .onChange((value) => {
                        type.icon = value.trim();
                        void this.plugin.saveSettings();
                    }),
            );
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
