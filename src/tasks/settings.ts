import type { Setting, SettingDefinitionItem, TFile } from 'obsidian';

import type RonaldPlugin from '../main';
import { shortcutName, type SettingSectionContext } from '../settings/section';
import { isTaskNote } from '../shared/tasknotes';
import type { FilterChip } from '../shared/ui/filterbar';
import { GTD_NOTES } from './gtdnotes';

export interface TaskSettings {
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

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
    taskFilterTags: [
        { value: 'prio', type: 'other' },
        { value: 'vandaag', type: 'time' },
        { value: 'week', type: 'time' },
        { value: 'buiten', type: 'context' },
        { value: 'thuis', type: 'context' },
        { value: 'project', type: 'other' },
    ],
    insertTags: ['buiten', 'prio', 'vandaag', 'computer'],
    clearTags: ['vandaag'],
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

/**
 * A value from a declarative control as it is stored: a GTD note's tag the
 * way it is matched, see `normaliseTag`; anything else as it is.
 */
export function normaliseTaskSetting(key: string, value: unknown): unknown {
    const isTag = GTD_NOTES.some((note) => note.tagKey === key);
    return isTag && typeof value === 'string' ? normaliseTag(value) : value;
}

/**
 * The task settings: the task folder with the GTD notes and their tags, and
 * the tag lists of the task search and the tag commands.
 *
 * The tag lists are declarative `list`s so Obsidian supplies the drag
 * handles, delete buttons and add affordance itself.
 *
 * The rows of the filter tags are rendered imperatively rather than with a
 * `control`: a row holds two fields (the tag and its type) where a control
 * gives one, and keeping them on a single row is the point — a tag and its
 * type are one entry, not two parallel lists.
 */
export function taskSettingSections({ plugin, save }: SettingSectionContext): SettingDefinitionItem[] {
    const { settings } = plugin;
    const tags = settings.taskFilterTags;
    const insertTags = settings.insertTags;
    const clearTags = settings.clearTags;

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
                                const { taskFolder } = plugin.settings;
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
                                    (o) => o !== note && plugin.settings[o.tagKey] === tag,
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
                    tags.push({ value: '', type: 'other' });
                    void save();
                },
            },
            onReorder: (oldIndex, newIndex) => {
                const [moved] = tags.splice(oldIndex, 1);
                if (moved) tags.splice(newIndex, 0, moved);
                void save();
            },
            onDelete: (index) => {
                tags.splice(index, 1);
                void save();
            },
            items: tags.map((chip, index) => ({
                name: chip.value.length > 0 ? `#${chip.value}` : 'New tag',
                searchable: false,
                render: (setting: Setting) => renderTagRow(plugin, setting, chip, index),
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
                    insertTags.push('');
                    void save();
                },
            },
            onReorder: (oldIndex, newIndex) => {
                const [moved] = insertTags.splice(oldIndex, 1);
                if (moved !== undefined) insertTags.splice(newIndex, 0, moved);
                void save();
            },
            onDelete: (index) => {
                insertTags.splice(index, 1);
                void save();
            },
            items: insertTags.map((tag, index) => ({
                name: tag.length > 0 ? `#${tag}` : 'New tag',
                searchable: false,
                render: (setting: Setting) =>
                    renderPlainTagRow(plugin, setting, insertTags, index),
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
                    clearTags.push('');
                    void save();
                },
            },
            onReorder: (oldIndex, newIndex) => {
                const [moved] = clearTags.splice(oldIndex, 1);
                if (moved !== undefined) clearTags.splice(newIndex, 0, moved);
                void save();
            },
            onDelete: (index) => {
                clearTags.splice(index, 1);
                void save();
            },
            items: clearTags.map((tag, index) => ({
                name: tag.length > 0 ? `#${tag}` : 'New tag',
                searchable: false,
                render: (setting: Setting) =>
                    renderPlainTagRow(plugin, setting, clearTags, index),
            })),
        },
    ];
}

/**
 * One bare-tag entry, used by every list that is just tags. The name column
 * stays empty: unlike the filter chips there is no shortcut tied to the
 * position, and the tag itself is already visible in its field.
 */
function renderPlainTagRow(
    plugin: RonaldPlugin,
    setting: Setting,
    tags: string[],
    index: number,
): void {
    setting.setName('').setClass('ronald-setting-tag-row').addText((text) =>
        text
            .setPlaceholder('Tag')
            .setValue(tags[index] ?? '')
            .onChange((value) => {
                tags[index] = value.trim().replace(/^#/, '').toLowerCase();
                void plugin.saveSettings();
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
function renderTagRow(
    plugin: RonaldPlugin,
    setting: Setting,
    chip: FilterChip,
    index: number,
): void {
    setting
        .setName(shortcutName(index))
        .setClass('ronald-setting-tag-row')
        .addText((text) =>
            text
                .setPlaceholder('Tag')
                .setValue(chip.value)
                .onChange((value) => {
                    chip.value = value.trim().replace(/^#/, '').toLowerCase();
                    void plugin.saveSettings();
                }),
        )
        .addText((text) =>
            text
                .setPlaceholder('Type')
                .setValue(chip.type)
                .onChange((value) => {
                    chip.type = value.trim().toLowerCase();
                    void plugin.saveSettings();
                }),
        );
}
