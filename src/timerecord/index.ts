/**
 * Time records
 * ============
 *
 * A log of what you are doing when, kept in the note "tijdsregistratie". Each
 * record is one line at the bottom of that note, stamped with the time it was
 * added: "- `14:05:12` Overleg met Jan".
 *
 * How to use it
 * -------------
 * - "Add time record to "tijdsregistratie" note" (also a ribbon icon) asks
 *   for a message and adds it with the current time.
 * - "Open "tijdsregistratie" note" opens the note at its last line.
 * - obsidian://ronald-timerecord does the same as the first command;
 *   obsidian://ronald-timerecord?message=Lunch adds that record without
 *   asking, which suits a shortcut for one fixed event.
 * - obsidian://ronald-tijdsregistratie opens the note.
 *
 * Where the code is
 * -----------------
 * - addtimerecord.ts     adding a record
 * - timerecordmodal.ts   the dialog that asks for the message
 * - timerecordnote.ts    finding and opening the note
 * - urihandler.ts        the two URIs
 */

import type { Plugin } from 'obsidian';

import { addTimeRecord } from './addtimerecord';
import { openTimeRecordNote } from './timerecordnote';
import { registerTijdsregistratieUriHandler, registerTimeRecordUriHandler } from './urihandler';

/** Register the time record commands and URIs. */
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
