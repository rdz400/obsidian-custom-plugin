import { App, Notice, TFile } from 'obsidian';

import { appendToNote } from '../../shared/vault';

/**
 * Add `line` to the end of `file`, the GTD note called `name`, and say so in
 * a notice. Returns whether it was written.
 */
export async function addTaskLine(
    app: App,
    file: TFile,
    name: string,
    line: string,
): Promise<boolean> {
    try {
        await appendToNote(app, file, line);
    } catch (error) {
        console.error('Plugin van Ronald: could not add the task', error);
        new Notice(`Could not add the task to ${name}`);
        return false;
    }
    new Notice(`Task added to ${name}`);
    return true;
}
