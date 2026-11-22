import { App, Notice } from 'obsidian';

import type RonaldPlugin from '../../main';
import { chipTags } from '../recordtags';
import type { TimeRecordSettings } from '../settings';
import { collectHistory, type OrderIssue } from './collect';
import { TimeHistoryModal, type TimeHistoryPreset } from './modal';

/** How long the notice about records out of order stays up. */
const ORDER_NOTICE_MS = 15_000;

/** Read the history and open the search on it, as `preset` asks if given. */
export async function searchTimeRecords(
    app: App,
    settings: TimeRecordSettings,
    preset?: TimeHistoryPreset,
): Promise<void> {
    const { entries, issues } = await collectHistory(app);
    if (entries.length === 0) {
        new Notice('No time records found');
        return;
    }
    new TimeHistoryModal(app, entries, chipTags(settings.timeRecordTags), preset).open();
    if (issues.length > 0) showOrderIssues(issues);
}

/**
 * Say where the first break in the order is, and how many more there are. The
 * rows themselves are marked too, but they can lie far down the list.
 */
function showOrderIssues([first, ...rest]: readonly OrderIssue[]): void {
    if (!first) return;
    const more = rest.length > 0 ? `, and ${rest.length} more` : '';
    new Notice(
        `Time records out of order in "${first.note.basename}" at line ${first.line + 1}${more}`,
        ORDER_NOTICE_MS,
    );
}

/** Register the search through the time record history. */
export function registerTimeHistory(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'search-time-records',
        name: 'Search time records',
        icon: 'history',
        callback: () => void searchTimeRecords(plugin.app, plugin.settings),
    });
}
