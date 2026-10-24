import type { Plugin } from 'obsidian';

import { addTimeRecord } from './addtimerecord';
import { openTimeRecordNote } from './timerecordnote';
import { registerTijdsregistratieUriHandler, registerTimeRecordUriHandler } from './urihandler';

/** Time records in the "tijdsregistratie" note: opening it and adding to it. */
export function registerTimeRecords(plugin: Plugin): void {
    plugin.addCommand({
        id: 'open-tijdsregistratie-note',
        name: 'Open "tijdsregistratie" note',
        icon: 'timer',
        callback: () => void openTimeRecordNote(plugin.app),
    });

    plugin.addCommand({
        id: 'add-time-record',
        name: 'Add time record to "tijdsregistratie" note',
        icon: 'timer',
        callback: () => addTimeRecord(plugin.app),
    });

    plugin.addRibbonIcon('timer', 'Add time record', () => addTimeRecord(plugin.app));

    registerTijdsregistratieUriHandler(plugin);
    registerTimeRecordUriHandler(plugin);
}
