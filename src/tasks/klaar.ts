import { App, ListItemCache, MarkdownView, Notice, type TFile } from 'obsidian';

import { freshCache } from '../shared/editor/freshcache';
import { todayLink, underHeading } from './dayheading';
import { Move } from './undomove';

/** The note finished tasks are moved to, and opened by "Open klaar". */
const KLAAR_NOTE = 'klaar';

/**
 * The "klaar" note, resolved the way `[[klaar]]` is: in any folder, and the
 * same note for moving and opening when more than one note is called that.
 */
function findKlaarNote(app: App): TFile | null {
    return app.metadataCache.getFirstLinkpathDest(KLAAR_NOTE, '');
}

/** A finished checkbox is `[x]` or `[X]`. */
function isDoneTask(item: ListItemCache): boolean {
    return item.task === 'x' || item.task === 'X';
}

/**
 * Move every finished top-level task to the end of the note named "klaar".
 *
 * A top-level (unindented) task is moved together with its whole subtree, but
 * only when the root task is finished AND every checkbox descendant is finished
 * too. Top-level list items that aren't tasks, and tasks with any unfinished
 * checkbox in their subtree, are left in place.
 */
export async function moveFinishedTasksToKlaar(app: App): Promise<void> {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
        new Notice('No active note');
        return;
    }

    const target = findKlaarNote(app);
    if (!target) {
        new Notice('Note "klaar" not found');
        return;
    }

    const sourceFile = view.file;
    if (!sourceFile) {
        new Notice('No active note');
        return;
    }
    if (target === sourceFile) {
        new Notice('Cannot move tasks from "klaar" into itself');
        return;
    }

    const editor = view.editor;
    // The ranges below are removed from the editor, so they must come from a
    // cache of what the editor shows, not of an older save.
    const text = editor.getValue();
    const cache = await freshCache(app, sourceFile, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }
    const items = cache.listItems ?? [];

    // Index list items by the line their item starts on, so a `parent` line
    // reference can be resolved to its ListItemCache.
    const byLine = new Map<number, ListItemCache>();
    for (const item of items) {
        byLine.set(item.position.start.line, item);
    }

    // Top-level items have a negative `parent` (it encodes the section, not a
    // line). Group every descendant under its top-level ancestor.
    const isTopLevel = (item: ListItemCache) => item.parent < 0;
    const topLevelOf = (item: ListItemCache): ListItemCache => {
        let current = item;
        while (!isTopLevel(current)) {
            const parent = byLine.get(current.parent);
            if (!parent) break;
            current = parent;
        }
        return current;
    };

    // Collect, per top-level root line: the root item, whether every checkbox
    // in the subtree is finished, and the last line of the whole subtree.
    //
    // A parent's own `position.end.line` only covers its own text, NOT its
    // descendants (a list item separated from its parent by a blank line still
    // belongs to it but lives on a later line). So we derive the block's end as
    // the maximum `end.line` over every item in the subtree. Any blank lines
    // interleaved between those items fall inside [from, to] and move with it.
    const roots = new Map<
        number,
        { root: ListItemCache; allDone: boolean; endLine: number }
    >();
    for (const item of items) {
        const root = topLevelOf(item);
        const startLine = root.position.start.line;
        let entry = roots.get(startLine);
        if (!entry) {
            entry = { root, allDone: true, endLine: root.position.end.line };
            roots.set(startLine, entry);
        }
        // Extend the block to cover this descendant.
        entry.endLine = Math.max(entry.endLine, item.position.end.line);
        // A checkbox task that isn't done disqualifies the whole subtree.
        if (item.task !== undefined && !isDoneTask(item)) {
            entry.allDone = false;
        }
    }

    // A root qualifies when it is itself a finished task and its subtree is done.
    const movable = [...roots.values()].filter(
        (e) => isDoneTask(e.root) && e.allDone,
    );
    if (movable.length === 0) {
        new Notice('No finished tasks to move');
        return;
    }

    // Sort top-to-bottom so the appended text keeps document order.
    movable.sort((a, b) => a.root.position.start.line - b.root.position.start.line);

    const blocks = movable.map((e) => {
        const from = e.root.position.start.line;
        const to = e.endLine;
        return {
            from,
            to,
            text: editor.getRange(
                { line: from, ch: 0 },
                { line: to, ch: editor.getLine(to).length },
            ),
        };
    });

    const moved = blocks.map((b) => b.text).join('\n');

    // Append to "klaar" first; only remove from the source if that succeeds.
    // Tasks go under a `## [[<daily note>]]` heading for today, which is added
    // when the note doesn't already end with one.
    const move = new Move(app, sourceFile);
    const heading = `## ${todayLink(app)}`;
    await move.append(target, (content) => underHeading(content, heading, moved));

    // Edits while writing would shift the lines; they are in "klaar" already.
    if (editor.getValue() !== text) {
        new Notice(`Note changed while moving; copied to ${target.basename} but left here too`);
        return;
    }
    // One edit, so a single undo puts every task back and takes them (and a
    // heading added for them) out of "klaar" again.
    const kept = text.split('\n').filter((_, i) => !blocks.some((b) => i >= b.from && i <= b.to));
    move.finish(editor, kept.join('\n'), moved);

    new Notice(`Moved ${blocks.length} task(s) to ${target.basename}`);
}

/** Open the "klaar" note in the most recent tab of the main area. */
export async function openKlaar(app: App): Promise<void> {
    const note = findKlaarNote(app);
    if (!note) {
        new Notice(`Note "${KLAAR_NOTE}" not found`);
        return;
    }
    const leaf =
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
    await leaf.openFile(note);
}
