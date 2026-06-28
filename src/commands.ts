import {
    App,
    Editor,
    EditorPosition,
    FuzzySuggestModal,
    ListItemCache,
    MarkdownView,
    Notice,
    TFile,
    normalizePath,
} from 'obsidian';
import { toggleCheckbox } from './functions';




/** Open a fuzzy-search modal to pick a note, then log its metadata cache to the console. */
export function getMyCache(app: App): void {
    new NoteSuggestModal(app, (file: TFile) => {
        const cache = app.metadataCache.getFileCache(file);
        console.log(`Metadata cache for ${file.path}:`, cache);
    }).open();
}


/** Remove the lines [from.line, to.line] from the editor, including a surrounding newline. */
function removeLines(editor: Editor, from: number, to: number): void {
    if (from === 0 && to < editor.lastLine()) {
        // Leading lines: also drop the newline after them.
        editor.replaceRange(
            '',
            { line: from, ch: 0 },
            { line: to + 1, ch: 0 },
        );
    } else if (from > 0) {
        // Non-leading lines: also drop the newline before them.
        editor.replaceRange(
            '',
            { line: from - 1, ch: editor.getLine(from - 1).length },
            { line: to, ch: editor.getLine(to).length },
        );
    } else {
        // The selection is the whole document.
        editor.replaceRange(
            '',
            { line: 0, ch: 0 },
            { line: to, ch: editor.getLine(to).length },
        );
    }
}

/** Return the text of the currently selected lines (full lines, not partial selections). */
function getSelectedLinesText(editor: Editor): string {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return editor.getRange(
        { line: from.line, ch: 0 },
        { line: to.line, ch: editor.getLine(to.line).length },
    );
}

/** Open all task notes in new tabs. */
export async function openTaakBestanden(app: App): Promise<void> {
    const files = app.vault.getMarkdownFiles().filter((file) => {
        if (file.path.startsWith('9-sjablonen/')) return false;
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'taken';
    });

    for (const file of files) {
        const leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(file);
    }
}

/** Folder configured in the core "Templates" plugin, or null if unset/disabled. */
function getTemplatesFolder(app: App): string | null {
    const instance = (app as any).internalPlugins?.getPluginById('templates')?.instance;
    const folder = instance?.options?.folder;
    return typeof folder === 'string' && folder.length > 0 ? normalizePath(folder) : null;
}

/** Move every note whose frontmatter `type` is "taken" into the root folder "1-taken". */
export async function moveTakenNotesToFolder(app: App): Promise<void> {
    const targetFolder = '1-taken';

    if (!app.vault.getFolderByPath(targetFolder)) {
        await app.vault.createFolder(targetFolder);
    }

    const templatesFolder = getTemplatesFolder(app);
    const isTemplate = (file: TFile): boolean =>
        templatesFolder !== null &&
        (file.path === templatesFolder || file.path.startsWith(`${templatesFolder}/`));

    const files = app.vault.getMarkdownFiles().filter((file) => {
        if (isTemplate(file)) return false;
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'taken';
    });

    let moved = 0;
    for (const file of files) {
        const dest = `${targetFolder}/${file.name}`;
        if (file.path === dest) continue;
        if (app.vault.getAbstractFileByPath(dest)) {
            new Notice(`Skipped "${file.name}": already exists in ${targetFolder}`);
            continue;
        }
        await app.fileManager.renameFile(file, dest);
        moved++;
    }

    new Notice(`Moved ${moved} note(s) to ${targetFolder}`);
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

    const target = app.vault.getMarkdownFiles().find((f) => f.basename === 'klaar');
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
    const items = app.metadataCache.getFileCache(sourceFile)?.listItems ?? [];

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
    const content = await app.vault.read(target);
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await app.vault.modify(target, content + separator + moved + '\n');

    // Remove from bottom to top so earlier ranges stay valid.
    for (const block of [...blocks].reverse()) {
        removeLines(editor, block.from, block.to);
    }

    new Notice(`Moved ${blocks.length} task(s) to ${target.basename}`);
}

/** Move the selected lines to the end of the document. */
export function moveLinesToEnd(editor: Editor): void {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    const text = getSelectedLinesText(editor);

    const lastLine = editor.lastLine();
    editor.replaceRange(
        '\n' + text,
        { line: lastLine, ch: editor.getLine(lastLine).length },
    );

    removeLines(editor, from.line, to.line);
}

/** Toggle the `#nu` tag on selected list items. */
export function toggleNuTag(editor: Editor): void {
    const from: EditorPosition = editor.getCursor('from');
    const to: EditorPosition = editor.getCursor('to');
    for (let i = from.line; i <= to.line; i++) {
        const line = editor.getLine(i);
        if (!/^\s*[-*]\s/.test(line)) continue;
        if (/(?<!\w)#nu\b/.test(line)) {
            editor.setLine(i, line.replace(/ ?#nu\b ?/g, (m, offset, str: string) => {
                if (offset === 0) return '';
                if (offset + m.length === str.length) return '';
                return ' ';
            }));
        } else {
            editor.setLine(i, line + ' #nu');
        }
    }
}

/** Move the selected lines to a chosen note via a fuzzy-search modal. */
export function moveLinesToNote(app: App, editor: Editor): void {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    const text = getSelectedLinesText(editor);

    new NoteSuggestModal(app, async (file: TFile) => {
        const content = await app.vault.read(file);
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        await app.vault.modify(file, content + separator + text + '\n');

        removeLines(editor, from.line, to.line);

        new Notice(`Moved to ${file.basename}`);
    }).open();
}

/** Cycle the checkbox state of the current line, preserving the cursor/selection position. */
export function toggleCheckBoxAdvanced(editor: Editor): void {
    const cursor = editor.getCursor();
    const anchor = editor.getCursor('anchor');
    const line = editor.getLine(cursor.line);
    const toggled = toggleCheckbox(line);
    const delta = toggled.length - line.length;
    editor.setLine(cursor.line, toggled);

    if (cursor.line === anchor.line && cursor.ch !== anchor.ch) {
        const newCursor = { line: cursor.line, ch: Math.max(0, cursor.ch + delta) };
        const newAnchor = { line: anchor.line, ch: Math.max(0, anchor.ch + delta) };
        editor.setSelection(newAnchor, newCursor);
    } else {
        const distFromEnd = line.length - cursor.ch;
        editor.setCursor({ line: cursor.line, ch: Math.max(0, toggled.length - distFromEnd) });
    }
}

class NoteSuggestModal extends FuzzySuggestModal<TFile> {
    private onChoose: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile): void {
        this.onChoose(item);
    }
}
