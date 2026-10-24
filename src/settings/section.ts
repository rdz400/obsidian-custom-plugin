import { Platform } from 'obsidian';

import type RonaldPlugin from '../main';

/** What a feature's settings sections need from the settings tab. */
export interface SettingSectionContext {
    plugin: RonaldPlugin;
    /** Persist, then rebuild the rows so labels and shortcut hints follow. */
    save: () => Promise<void>;
}

/** Matches the modifier the filter bar actually listens for. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';

/**
 * The name of a list row whose position is its chip's shortcut: "Cmd+1" for
 * the first row, nothing from the tenth on, where shortcuts stop.
 */
export function shortcutName(index: number): string {
    return index < 9 ? `${SHORTCUT_MODIFIER}+${index + 1}` : '';
}
