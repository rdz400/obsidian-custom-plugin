import { Plugin } from 'obsidian';

import { registerEditingCommands } from './editing';
import { registerLinkFeatures } from './links';
import { registerNaming } from './naming';
import { registerNavigation } from './navigation';
import { TabRecency } from './shared/tabrecency';
import { activeProjectsOf, registerProjectFeatures } from './projects';
import {
    DEFAULT_SETTINGS,
    RonaldSettingTab,
    type RonaldSettings,
} from './settings';
import { registerTaskFeatures } from './tasks';
import { registerTimeRecords } from './timerecord';

export default class RonaldPlugin extends Plugin {
    settings!: RonaldSettings;
    private readonly tabRecency = new TabRecency();

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new RonaldSettingTab(this.app, this));

        // Recorded from load on, so the switchers can list recent tabs first.
        this.tabRecency.register(this);

        registerEditingCommands(this);
        // The tasks' "New task" links to a project; which are active is for
        // projects/ to say, so it is handed over here.
        registerTaskFeatures(this, this.tabRecency, activeProjectsOf(this));
        registerProjectFeatures(this);
        registerLinkFeatures(this);
        registerNavigation(this, this.tabRecency);
        registerTimeRecords(this);
        registerNaming(this);
    }

    onunload() {}

    async loadSettings(): Promise<void> {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<RonaldSettings>,
        );
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
