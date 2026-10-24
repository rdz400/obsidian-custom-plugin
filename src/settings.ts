import {
    App,
    Platform,
    PluginSettingTab,
    type Setting,
    type SettingDefinitionItem,
    type TFile,
} from 'obsidian';

import { GTD_NOTES } from './tasks/gtdnotes';
import { isTaskNote } from './tasks/tasknotes';
import type { FilterChip } from './shared/ui/filterbar';
import type RonaldPlugin from './main';
import type { NoteTypeSetting } from './shared/ui/notetype';

export interface RonaldSettings {
    /**
     * Tag chips offered as filters in the task search, in the order they are
     * shown and numbered as Mod+1…Mod+9.
     */
    taskFilterTags: FilterChip[];

    /** Tags offered by the "Insert tag at end of line" command, in order. */
    insertTags: string[];

    /**
     * Tags that get a "Remove #tag from all task notes" command, in order: the
     * tag is removed from every task note, see `taskFolder`.
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

    /**
     * The folder whose notes are the task notes: the ones the task search, the
     * project task counts and the tag commands work on. Only notes directly in
     * it count, not those in a subfolder. The GTD notes are expected here.
     */
    taskFolder: string;

    /**
     * Vault paths of the GTD notes the "Move line(s) to …" commands send lines
     * to; empty hides that command.
     */
    todayNote: string;
    somedayNote: string;
    overviewNote: string;
    inboxNote: string;

    /**
     * The tag of the tasks that belong in each GTD note, lower case and
     * without `#`; empty when none does. No two notes share a tag.
     */
    todayTag: string;
    somedayTag: string;
    overviewTag: string;
    inboxTag: string;
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
    taskFolder: '1-taken',
    todayNote: '',
    somedayNote: '',
    overviewNote: '',
    inboxNote: '',
    todayTag: 'vandaag',
    somedayTag: 'misschien',
    overviewTag: '',
    inboxTag: '',
};

/** A tag as stored in settings: trimmed, lower case, without the `#`. */
export function normaliseTag(value: string): string {
    return value.trim().replace(/^#/, '').toLowerCase();
}

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
                type: 'group',
                heading: 'Task notes',
                // The built-in file and folder controls store the path and save
                // through the tab's default setControlValue.
                items: [
                    {
                        name: 'Task notes folder',
                        desc: 'Notes directly in this folder hold tasks; subfolders are left out.',
                        control: {
                            type: 'folder',
                            key: 'taskFolder',
                            placeholder: 'Select a folder',
                        },
                    },
                    // Only notes in the task folder are offered, so a GTD note
                    // is always a task note; any note while no folder is set,
                    // so the picker isn't left empty.
                    ...GTD_NOTES.flatMap((note) => [
                        {
                            name: `Note for ${note.name}`,
                            desc: `Where "Move line(s) to ${note.name}" sends lines.`,
                            control: {
                                type: 'file' as const,
                                key: note.key,
                                placeholder: 'Select a note',
                                filter: (file: TFile) => {
                                    const { taskFolder } = this.plugin.settings;
                                    if (taskFolder.length === 0) return file.extension === 'md';
                                    return isTaskNote(file, taskFolder);
                                },
                            },
                        },
                        {
                            name: `Tag for ${note.name}`,
                            desc: `"Move tagged tasks to their GTD notes" sends tasks with this tag to the ${note.name} note.`,
                            control: {
                                type: 'text' as const,
                                key: note.tagKey,
                                placeholder: 'Tag',
                                // A tag picks one note, so it can't be another's too.
                                validate: (value: string) => {
                                    const tag = normaliseTag(value);
                                    const other = GTD_NOTES.find(
                                        (o) => o !== note && this.plugin.settings[o.tagKey] === tag,
                                    );
                                    return tag.length > 0 && other
                                        ? `Already the tag for ${other.name}`
                                        : undefined;
                                },
                            },
                        },
                    ]),
                ],
            },
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
                heading: 'Tags to clear from task notes (reload after changing)',
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

    /** Stores a GTD note's tag the way it is matched: see `normaliseTag`. */
    async setControlValue(key: string, value: unknown): Promise<void> {
        const isTag = GTD_NOTES.some((note) => note.tagKey === key);
        await super.setControlValue(key, isTag && typeof value === 'string' ? normaliseTag(value) : value);
    }
}

/** Matches the modifier the filter bar actually listens for. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';
