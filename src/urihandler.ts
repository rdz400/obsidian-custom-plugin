import { Plugin } from 'obsidian';

import { addTimeRecord } from './timerecord/addtimerecord';
import { openTimeRecordNote } from './timerecord/timerecordnote';

/** The protocol action that opens the "tijdsregistratie" note. */
export const TIJDSREGISTRATIE_URI_ACTION = 'ronald-tijdsregistratie';

/** The protocol action that adds a time record to that note. */
export const TIME_RECORD_URI_ACTION = 'ronald-timerecord';

/** Parameters read by the time record action. */
interface TimeRecordUriParams extends Record<string, string> {
    /** The record's text; when given, it is added without showing the modal. */
    message: string;
}

/**
 * Register `obsidian://ronald-tijdsregistratie` for the lifetime of the plugin.
 *
 * The URI takes no parameters and does exactly what the command does: open the
 * "tijdsregistratie" note at its last line.
 */
export function registerTijdsregistratieUriHandler(plugin: Plugin): void {
    plugin.registerObsidianProtocolHandler(TIJDSREGISTRATIE_URI_ACTION, () => {
        void openTimeRecordNote(plugin.app);
    });
}

/**
 * Register `obsidian://ronald-timerecord` for the lifetime of the plugin.
 *
 * The bare URI opens the "Add time record" modal exactly as the command does;
 * with `message=…` the record is added straight away, which suits a shortcut
 * bound to one fixed event.
 */
export function registerTimeRecordUriHandler(plugin: Plugin): void {
    plugin.registerObsidianProtocolHandler(TIME_RECORD_URI_ACTION, (params) => {
        const { message } = params as Partial<TimeRecordUriParams>;
        addTimeRecord(plugin.app, message);
    });
}
