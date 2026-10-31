import type { Setting, SettingDefinitionItem } from 'obsidian';

import type RonaldPlugin from '../main';
import { editableList, shortcutName, type SettingSectionContext } from '../settings/section';
import { DEFAULT_PROJECT_STATUSES, type ProjectStatus } from './statuses';

export interface ProjectSettings {
    /**
     * The project statuses, in the order the status picker, the search chips
     * (Mod+1…Mod+9) and the search results follow; see `ProjectStatus`.
     */
    projectStatuses: ProjectStatus[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
    projectStatuses: DEFAULT_PROJECT_STATUSES,
};

/** The project statuses, as a declarative `list` like the task filter tags. */
export function projectSettingSections({
    plugin,
    save,
}: SettingSectionContext): SettingDefinitionItem[] {
    const statuses = plugin.settings.projectStatuses;

    return [
        editableList(save, {
            // The two switches have no room for a label of their own on the
            // row, so the heading names them in their order.
            heading: 'Project statuses (switches: closes the project, hidden in search)',
            emptyState: 'No statuses yet.',
            addName: 'Add status',
            entries: statuses,
            newEntry: () => ({ value: '', icon: '', closed: false, hidden: false }),
            itemName: (status) => (status.value.length > 0 ? status.value : 'New status'),
            render: (setting, status, index) => renderStatusRow(plugin, setting, status, index),
        }),
    ];
}

/**
 * One status: its value, its icon and the two switches. Numbered like the
 * task filter tags, since the position decides the chip's shortcut.
 */
function renderStatusRow(
    plugin: RonaldPlugin,
    setting: Setting,
    status: ProjectStatus,
    index: number,
): void {
    setting
        .setName(shortcutName(index))
        .setClass('ronald-setting-tag-row')
        .addText((text) =>
            text
                .setPlaceholder('Status')
                .setValue(status.value)
                .onChange((value) => {
                    status.value = value.trim();
                    void plugin.saveSettings();
                }),
        )
        .addText((text) =>
            text
                .setPlaceholder('Icon')
                .setValue(status.icon)
                .onChange((value) => {
                    status.icon = value.trim();
                    void plugin.saveSettings();
                }),
        )
        .addToggle((toggle) =>
            toggle
                .setTooltip('Closes the project: sets "eind", left out of the link pickers')
                .setValue(status.closed)
                .onChange((value) => {
                    status.closed = value;
                    void plugin.saveSettings();
                }),
        )
        .addToggle((toggle) =>
            toggle
                .setTooltip('Hidden in project search until its chip is on')
                .setValue(status.hidden)
                .onChange((value) => {
                    status.hidden = value;
                    void plugin.saveSettings();
                }),
        );
}
