import { App, Notice, type Plugin } from 'obsidian';

import { collectHistory } from './collect';
import { TimeHistoryModal, type TimeHistoryPreset } from './modal';

/** Read the history and open the search on it, as `preset` asks if given. */
export async function searchTimeRecords(app: App, preset?: TimeHistoryPreset): Promise<void> {
    const entries = await collectHistory(app);
    if (entries.length === 0) {
        new Notice('No time records found');
        return;
    }
    new TimeHistoryModal(app, entries, preset).open();
}

/** Register the search through the time record history. */
export function registerTimeHistory(plugin: Plugin): void {
    plugin.addCommand({
        id: 'search-time-records',
        name: 'Search time records',
        icon: 'history',
        callback: () => void searchTimeRecords(plugin.app),
    });
}
