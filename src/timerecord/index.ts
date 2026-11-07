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
 * - In every note with `type: tijdsregistratie` in its frontmatter, the time
 *   a record opens with is shaded by its hour, like a heatmap of the day:
 *   in live preview, source mode and reading mode. Only that first time is;
 *   an explicit end later on the line keeps the plain inline code look. The
 *   colour, and how strong its tint gets, are set in `styles.css`.
 * - "Search time records" searches every note with that type, so also records
 *   moved to an archive. The latest record comes first. Each query word must match
 *   the text, the start of the time, or the date: "overleg maandag", "okt 2026".
 *   The weekday chips, or Mod+1 (Monday) to Mod+7 (Sunday), show only those days.
 *   A row shows how long the record took, if it has an explicit end, and the
 *   time to the next record of that day. Enter opens the note at the record,
 *   Mod+Enter in a new tab.
 * - obsidian://ronald-timerecord-search opens that search;
 *   obsidian://ronald-timerecord-search?query=overleg&days=ma,donderdag opens it
 *   with that text and those weekday chips. A day is a chip's label or a full
 *   name, Dutch or English.
 *
 * Days in the history
 * -------------------
 * A level 2 heading starts a day, ideally "## [[20261104]]". So does any heading
 * with a date, a `---` line, and a top-level record with an earlier time than the
 * top-level record before it; nested records keep their own time and don't count
 * for that. A day without a date in its heading gets one only when no other is possible:
 * a single such day between the 4th and the 6th was the 5th, shown as
 * "~ donderdag 5 november 2026". Any other is headed with what it lies between,
 * and has no weekday to search on. Several of those in a row are numbered in the
 * note's order: "vóór 24 oktober 2026 (dag 2 van 2)".
 *
 * Where the code is
 * -----------------
 * - addtimerecord.ts     adding a record
 * - recordline.ts        what a record line is, and reading one
 * - timerecordmodal.ts   the dialog that asks for the message
 * - timerecordnote.ts    finding and opening the note, telling a time record note
 * - urihandler.ts        the three URIs
 * - heatmap/             colouring the times: which notes, and the editor
 *                        (index.ts), the classes (heatmap.ts), reading
 *                        mode (postprocessor.ts)
 * - history/             searching the records: the command (index.ts), reading
 *                        the notes (collect.ts), a note's text to days
 *                        (parsedays.ts), what is known of their dates
 *                        (placedays.ts), dates (calendar.ts), durations
 *                        (durations.ts), the rows of the list (entries.ts), the
 *                        query (search.ts), the weekday chips (weekdayfilter.ts),
 *                        the dialog (modal.ts)
 */

import type { Plugin } from 'obsidian';

import { addTimeRecord } from './addtimerecord';
import { registerTimeHeatmap } from './heatmap';
import { registerTimeHistory } from './history';
import { openTimeRecordNote } from './timerecordnote';
import {
    registerTijdsregistratieUriHandler,
    registerTimeRecordSearchUriHandler,
    registerTimeRecordUriHandler,
} from './urihandler';

/** Register the time record commands, URIs, the colouring of times and the history. */
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
    registerTimeRecordSearchUriHandler(plugin);

    registerTimeHeatmap(plugin);
    registerTimeHistory(plugin);
}
