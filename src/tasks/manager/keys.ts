import { Keymap } from 'obsidian';

import { MOVE_KEYS } from './actionbar';
import type { GtdId } from './draft';
import type { Selection } from './selection';

/** What the keys of the task manager act on. */
export interface KeyTarget {
    readonly picked: Selection;
    /** The selectable rows, in list order. */
    readonly rows: readonly number[];
    /** The filter tags, in the order of their buttons. */
    readonly tags: readonly string[];
    /** Offer a press to the chip bars; true when one took it. */
    chipKey(event: KeyboardEvent): boolean;
    refresh(): void;
    toggleTag(tag: string): void;
    move(to: GtdId): void;
    toggleDone(): void;
    toggleView(value: string): void;
    undo(): void;
    apply(): Promise<void>;
}

/**
 * Handle a key press anywhere in the task manager; true when it was used.
 * There is no text field, so plain letters and digits are free. A held key
 * repeats moving the focus, not the actions.
 */
export function handleManagerKey(event: KeyboardEvent, target: KeyTarget): boolean {
    if (target.chipKey(event)) return true;

    const { picked, rows } = target;
    const mod = Keymap.isModifier(event, 'Mod');
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    const key = event.key.toLowerCase();

    if (plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        if (event.shiftKey) picked.extendBy(rows, step);
        else picked.moveFocus(rows, step);
        target.refresh();
        return true;
    }
    if (plain && !event.shiftKey && (event.key === 'Home' || event.key === 'End')) {
        picked.focus = event.key === 'Home' ? rows[0] : rows[rows.length - 1];
        target.refresh();
        return true;
    }
    if (mod && !event.shiftKey && !event.altKey) {
        if (key === 'a') {
            picked.selectAll(rows);
            target.refresh();
        } else if (key === 'z') {
            if (!event.repeat) target.undo();
        } else if (event.key === 'Enter') {
            if (!event.repeat) void target.apply();
        } else {
            return false;
        }
        return true;
    }
    if (!plain || event.shiftKey) return false;

    // A focused button takes Space itself.
    if (event.key === ' ') {
        if (event.target instanceof HTMLButtonElement) return false;
        if (!event.repeat && picked.focus !== undefined) {
            picked.toggle(picked.focus);
            target.refresh();
        }
        return true;
    }
    if (event.repeat) return /^[1-9tsoixdl]$/.test(key);
    if (/^[1-9]$/.test(key)) {
        const tag = target.tags[Number(key) - 1];
        if (tag !== undefined) target.toggleTag(tag);
        return tag !== undefined;
    }
    const move = (Object.keys(MOVE_KEYS) as GtdId[]).find((id) => MOVE_KEYS[id].toLowerCase() === key);
    if (move) target.move(move);
    else if (key === 'x') target.toggleDone();
    else if (key === 'd') target.toggleView('done');
    else if (key === 'l') target.toggleView('top-level');
    else return false;
    return true;
}
