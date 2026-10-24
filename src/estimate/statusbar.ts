import { setIcon, setTooltip, type Plugin, type TFile } from 'obsidian';

import { addActiveNoteStatus } from '../statusbar/activenote';
import { formatMinutes, openEstimateTotal } from './estimate';

/**
 * Show what the open tasks in the active note add up to, in notes `applies`
 * accepts. The item is hidden elsewhere, and in a note without estimates.
 */
export function registerEstimateTotal(plugin: Plugin, applies: (file: TFile) => boolean): void {
    addActiveNoteStatus(plugin, (el, note) => {
        const total = note && applies(note.file) ? openEstimateTotal(note.text) : null;
        el.empty();
        el.toggle(total !== null && total.tasks > 0);
        if (!total || total.tasks === 0) return;

        setIcon(el.createSpan({ cls: 'status-bar-item-icon' }), 'timer');
        el.createSpan({ text: formatMinutes(total.minutes) });
        setTooltip(
            el,
            `${total.tasks} open ${total.tasks === 1 ? 'task' : 'tasks'} with an estimate`,
            { placement: 'top' },
        );
    });
}
