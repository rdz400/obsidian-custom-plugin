import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';

import { linkSettingSections } from '../links/settings';
import type RonaldPlugin from '../main';
import { navigationSettingSections } from '../navigation/settings';
import { normaliseTaskSetting, taskSettingSections } from '../tasks/settings';
import type { SettingSectionContext } from './section';

/** One tab for the whole plugin, each feature adding its own sections. */
export class RonaldSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: RonaldPlugin) {
        super(app, plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const context: SettingSectionContext = {
            plugin: this.plugin,
            save: () => this.save(),
        };
        return [
            ...taskSettingSections(context),
            ...linkSettingSections(context),
            ...navigationSettingSections(context),
        ];
    }

    /** Persist, then rebuild the rows so labels and shortcut hints follow. */
    private async save(): Promise<void> {
        await this.plugin.saveSettings();
        this.update();
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        await super.setControlValue(key, normaliseTaskSetting(key, value));
    }
}
