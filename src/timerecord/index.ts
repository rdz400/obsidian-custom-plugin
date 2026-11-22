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
 *   for a message and adds it with the current time. While typing, earlier
 *   records that fit are listed under the field, the most used (and recently
 *   used) first; each word typed must start a word of the record. Enter adds
 *   what was typed, never a suggestion by itself; ↑/↓ pick one, and Enter then
 *   adds that; Tab or a tap puts it in the field to change first; Mod+Enter
 *   adds the first suggestion straight away.
 * - Below those are chips for the tags in **Settings → Tags to add to a
 *   time record**, toggled with a tap or Mod+1…9; the tags that are on go at
 *   the end of the line: "- `14:05:12` Overleg met Jan #werk". A suggestion
 *   turns on the chips its record had.
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
 *   moved to an archive, but not a template. The latest record comes first. Each query word must match
 *   the text, the start of the time, or the date: "overleg maandag", "okt 2026".
 *   The weekday chips, or Mod+1 (Monday) to Mod+7 (Sunday), show only those days;
 *   "<12" and "≥12" next to them, or Mod+8 and Mod+9, only records before or
 *   from noon. A record past midnight on a long day counts as after noon. A
 *   second row has a chip for each tag in **Settings → Tags to add to a time
 *   record**, or Alt+1…9, showing the records with any of those tags (or a tag
 *   nested under one). Tags in a record show as tags.
 *   A row shows how long the record took, if it has an explicit end, and the
 *   time to the next record of that day. Once a query or a chip narrows the
 *   list, the end of the chips shows the total time of all it found (more than
 *   the 300 rows shown, if there are), counting each record's explicit end, or
 *   else the time to the next record; the last record of a day counts nothing.
 *   Enter opens the note at the record,
 *   Mod+Enter in a new tab, Alt+Enter or Alt+click in a new tab in the
 *   background, leaving the search open.
 * - obsidian://ronald-timerecord-search opens that search;
 *   obsidian://ronald-timerecord-search?query=overleg&days=ma,donderdag opens it
 *   with that text and those weekday chips. A day is a chip's label or a full
 *   name, Dutch or English.
 *
 * Days in the history
 * -------------------
 * A level 2 heading starts a day, ideally "## [[20261104]]". So does any heading
 * with a date, and a `---` line. Nothing else does.
 *
 * Records are always written in order, nested ones too: each is at least as late
 * as the one above it. A long day may run past midnight once: a time earlier
 * than the one above it, and earlier than the day's first, is the next night,
 * and still belongs to the day it is written under. Any other step back in time
 * is out of order, and so is a date no later than the date above it. Those rows
 * and day headings get a red mark and no durations, and opening the search
 * says in a notice where the first one is and how many there are.
 *
 * A day without a date in its heading gets one only when no other is possible:
 * a single such day between the 4th and the 6th was the 5th, shown as
 * "~ donderdag 5 november 2026". Any other is headed with what it lies between,
 * and has no weekday to search on. Several of those in a row are numbered in the
 * note's order: "vóór 24 oktober 2026 (dag 2 van 2)".
 *
 * Where the code is
 * -----------------
 * - addtimerecord.ts     adding a record
 * - recordline.ts        what a record line is, and reading one
 * - recordtags.ts        the chip tags: taking them off a record's text, and adding them
 * - settings.ts          the tags offered as chips
 * - suggestions.ts       earlier records: ranking them and matching what is typed
 * - timerecordmodal.ts   the dialog that asks for the message
 * - timerecordnote.ts    finding and opening the note, telling a time record note
 * - urihandler.ts        the three URIs
 * - heatmap/             colouring the times: which notes, and the editor
 *                        (index.ts), the classes (heatmap.ts), reading
 *                        mode (postprocessor.ts)
 * - history/             searching the records: the command (index.ts), reading
 *                        the notes (collect.ts), a note's text to days
 *                        (parsedays.ts), what is known of their dates
 *                        (placedays.ts), the order within a day (order.ts),
 *                        dates (calendar.ts), durations (durations.ts), the rows
 *                        of the list and their total (entries.ts), the query
 *                        (search.ts), the chips for weekdays (weekdayfilter.ts),
 *                        the time of day (daypartfilter.ts) and tags
 *                        (tagfilter.ts), the dialog (modal.ts)
 */

import type RonaldPlugin from '../main';
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
export function registerTimeRecords(plugin: RonaldPlugin): void {
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
        callback: () => addTimeRecord(plugin.app, plugin.settings),
    });

    plugin.addRibbonIcon('timer', 'Add time record', () =>
        addTimeRecord(plugin.app, plugin.settings),
    );

    registerTijdsregistratieUriHandler(plugin);
    registerTimeRecordUriHandler(plugin);
    registerTimeRecordSearchUriHandler(plugin);

    registerTimeHeatmap(plugin);
    registerTimeHistory(plugin);
}
