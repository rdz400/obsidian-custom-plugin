import { App, Notice, moment } from 'obsidian';

import { TimeRecordModal } from './timerecordmodal';
import { getTimeRecordNote } from './timerecordnote';

/** The record line as it is written to the note: "- `hh:mm:ss` message". */
function formatTimeRecord(time: string, message: string): string {
    return `- \`${time}\` ${message}`;
}

/**
 * Append `line` as the last line of `text`.
 *
 * Trailing blank lines are dropped first so records stay together at the
 * bottom, and the note keeps ending in a newline.
 */
function appendLine(text: string, line: string): string {
    const body = text.replace(/\s+$/, '');
    return body.length === 0 ? `${line}\n` : `${body}\n${line}\n`;
}

/**
 * Ask for a message and add it, stamped with the current time, at the bottom
 * of the time record note.
 *
 * With a `message` the modal is skipped and that message is added right away;
 * a blank one counts as none.
 *
 * The note is looked up before the modal opens, so a vault without one says so
 * straight away rather than after the message has been typed.
 */
export function addTimeRecord(app: App, message?: string): void {
    const note = getTimeRecordNote(app);
    if (!note) return;

    const time = moment().format('HH:mm:ss');

    const add = async (text: string) => {
        // `process` reads and writes in one step, so an open editor on the
        // note picks the change up instead of overwriting it.
        await app.vault.process(note, (content) =>
            appendLine(content, formatTimeRecord(time, text)),
        );
        new Notice(`Added time record to "${note.basename}"`);
    };

    const given = message?.trim() ?? '';
    if (given.length > 0) {
        void add(given);
        return;
    }

    new TimeRecordModal(app, time, (text) => void add(text)).open();
}
