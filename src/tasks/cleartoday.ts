import { App, Editor, Notice, TFile } from 'obsidian';

import { freshCache } from '../shared/editor/freshcache';
import { restoreCursor } from '../shared/editor/lines';
import { todayLink, underHeading } from './dayheading';
import { takeLeftovers } from './leftovers';
import { Move } from './undomove';

/**
 * Move every open task hierarchy in `today`, the today note open in `editor`,
 * to the end of `overview`, under `## Uit vandaag [[<daily note>]]`, with the
 * today tag `todayTag` taken off. Finished hierarchies stay, for "klaar".
 *
 * The tasks are added to overview before they are taken out of today, in one
 * edit, so a single undo, in today or in overview, puts them back and takes
 * them, with a heading added for them, out of overview again.
 */
export async function moveOpenTasksToOverview(
    app: App,
    today: TFile,
    editor: Editor,
    overview: TFile,
    todayTag: string,
): Promise<void> {
    // The lines are removed from the editor, so the cache must be of what it
    // shows, not of an older save.
    const text = editor.getValue();
    const cache = await freshCache(app, today, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }

    const { text: kept, taken, moved } = takeLeftovers(text, cache, todayTag);
    if (moved === 0) {
        new Notice('No open tasks to move');
        return;
    }

    const move = new Move(app, today);
    const heading = `## Uit vandaag ${todayLink(app)}`;
    await move.append(overview, (content) => underHeading(content, heading, taken));

    // Edits while writing would shift the lines; the tasks are in overview already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied to ${overview.basename} but left here too`);
        return;
    }
    const origin = editor.getCursor('from');
    move.finish(editor, kept, taken);
    restoreCursor(editor, origin);
    new Notice(`Moved ${moved} ${moved === 1 ? 'task' : 'tasks'} to ${overview.basename}`);
}
