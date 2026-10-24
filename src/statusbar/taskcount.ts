import type { Plugin } from 'obsidian';

import { taskMarker } from '../tasksort/taskline';
import { addActiveNoteStatus } from '../shared/ui/activenote';

/** Show the number of tasks in the active note in the status bar, for any note. */
export function registerTaskCount(plugin: Plugin): void {
    addActiveNoteStatus(plugin, (el, note) => {
        if (!note) {
            el.setText('');
            return;
        }
        const count = note.text.split('\n').filter((line) => taskMarker(line) !== undefined).length;
        el.setText(String(count));
    });
}
