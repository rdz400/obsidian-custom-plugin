import {
    App,
    Editor,
    EditorChange,
    ListItemCache,
    MarkdownView,
    Notice,
    TFile,
    normalizePath,
} from 'obsidian';
import { selectedLineRange } from './editorcommands';
import { toggleCheckbox } from './functions';
import {
    NoteSuggestModal,
    StringSuggestModal,
    TagSuggestModal,
} from './modals';




/**
 * The edit that deletes lines [from, to], including a surrounding newline so no
 * blank line is left behind.
 *
 * Returned rather than applied so callers can combine it with another edit in a
 * single {@link Editor.transaction} — two separate `replaceRange` calls can end
 * up as two undo steps, which makes one undo revert only half of a move.
 */
function removalChange(editor: Editor, from: number, to: number): EditorChange {
    if (from === 0 && to < editor.lastLine()) {
        // Leading lines: also drop the newline after them.
        return {
            from: { line: from, ch: 0 },
            to: { line: to + 1, ch: 0 },
            text: '',
        };
    }
    if (from > 0) {
        // Non-leading lines: also drop the newline before them.
        return {
            from: { line: from - 1, ch: editor.getLine(from - 1).length },
            to: { line: to, ch: editor.getLine(to).length },
            text: '',
        };
    }
    // The selection is the whole document.
    return {
        from: { line: 0, ch: 0 },
        to: { line: to, ch: editor.getLine(to).length },
        text: '',
    };
}

/** Remove the lines [from.line, to.line] from the editor, including a surrounding newline. */
function removeLines(editor: Editor, from: number, to: number): void {
    const change = removalChange(editor, from, to);
    editor.replaceRange(change.text, change.from, change.to);
}

/** Return the text of the currently selected lines (full lines, not partial selections). */
function getSelectedLinesText(editor: Editor): string {
    const { from, to } = selectedLineRange(editor);
    return editor.getRange(
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length },
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

/** Open the most recently created note whose frontmatter `type` is "taken". */
export async function openMostRecentTaakNote(app: App): Promise<void> {
    const files = app.vault.getMarkdownFiles().filter((file) => {
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'taken';
    });

    if (files.length === 0) {
        new Notice('No "taken" notes found');
        return;
    }

    const mostRecent = files.reduce((a, b) => (b.stat.ctime > a.stat.ctime ? b : a));

    const leaf =
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ??
        app.workspace.getLeaf(false);
    await leaf.openFile(mostRecent);
}

/** Folder configured in the core "Templates" plugin, or null if unset/disabled. */
export function getTemplatesFolder(app: App): string | null {
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

/** Move every note in "0-inbox" whose frontmatter `type` is "project" into "1-projecten". */
export async function moveProjectNotesToFolder(app: App): Promise<void> {
    const sourceFolder = '0-inbox';
    const targetFolder = '1-projecten';

    if (!app.vault.getFolderByPath(targetFolder)) {
        await app.vault.createFolder(targetFolder);
    }

    const files = app.vault.getMarkdownFiles().filter((file) => {
        if (!file.path.startsWith(`${sourceFolder}/`)) return false;
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'project';
    });

    let moved = 0;
    for (const file of files) {
        const dest = `${targetFolder}/${file.name}`;
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

/** Date format of the daily note, taken from the core "Daily notes" plugin. */
const DEFAULT_DAILY_FORMAT = 'YYYYMMDD';

function getDailyNoteFormat(app: App): string {
    const instance = (app as any).internalPlugins?.getPluginById('daily-notes')?.instance;
    const format = instance?.options?.format;
    return typeof format === 'string' && format.length > 0 ? format : DEFAULT_DAILY_FORMAT;
}

/**
 * Format `date` with the subset of moment tokens used by daily-note formats.
 * Longest tokens first so `YYYY` wins over `YY`, `MM` over `M`, etc.
 */
function formatDate(date: Date, format: string): string {
    const tokens: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        YY: String(date.getFullYear()).slice(2),
        MM: pad2(date.getMonth() + 1),
        M: String(date.getMonth() + 1),
        DD: pad2(date.getDate()),
        D: String(date.getDate()),
        HH: pad2(date.getHours()),
        mm: pad2(date.getMinutes()),
        ss: pad2(date.getSeconds()),
    };
    // `[...]` escapes literal text in moment formats; leave its contents alone.
    return format.replace(
        /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|mm|ss/g,
        (match: string, literal?: string) =>
            literal !== undefined ? literal : tokens[match] ?? match,
    );
}

/** The `## [[20260725]]` heading that finished tasks of today belong under. */
function todayHeading(app: App): string {
    return `## [[${formatDate(new Date(), getDailyNoteFormat(app))}]]`;
}

/**
 * Return `content` guaranteed to end with a heading for today: if the last `##`
 * heading isn't today's, append a new one.
 */
function ensureTodayHeading(content: string, heading: string): string {
    const headings = content.match(/^##\s+.*$/gm);
    const last = headings?.[headings.length - 1];
    // Compare loosely so trailing whitespace in the file doesn't force a duplicate.
    if (last?.trim() === heading) return content;

    const separator = content.length === 0 || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    return content + separator + heading + '\n\n';
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
    // Tasks go under a `## [[<daily note>]]` heading for today, which is added
    // when the note doesn't already end with one.
    const content = await app.vault.read(target);
    const withHeading = ensureTodayHeading(content, todayHeading(app));
    await app.vault.modify(target, withHeading + moved + '\n');

    // Remove from bottom to top so earlier ranges stay valid.
    for (const block of [...blocks].reverse()) {
        removeLines(editor, block.from, block.to);
    }

    new Notice(`Moved ${blocks.length} task(s) to ${target.basename}`);
}

/** Move the selected lines to the end of the document. */
export function moveLinesToEnd(editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    const text = getSelectedLinesText(editor);

    const lastLine = editor.lastLine();
    if (to >= lastLine) return; // Already at the end.

    // Append after the last line that has content, so a trailing empty line
    // (notes usually end with a newline) doesn't become a blank gap above the
    // moved text — and isn't consumed either.
    const endsEmpty = editor.getLine(lastLine).length === 0;
    const anchor = endsEmpty ? lastLine - 1 : lastLine;
    const anchorEnd = { line: anchor, ch: editor.getLine(anchor).length };

    // Both changes are applied as one transaction so a single undo reverts the
    // whole move. Their positions are relative to the document as it is now,
    // not to the result of the other change.
    editor.transaction({
        changes: [
            removalChange(editor, from, to),
            { from: anchorEnd, to: anchorEnd, text: '\n' + text },
        ],
    });

    // Keep the moved lines selected. After the removal the block sits at the
    // end of the document, so count back from the last line that has content
    // (a trailing newline leaves an empty line below the block).
    let end = editor.lastLine();
    if (editor.getLine(end).length === 0 && end > 0) end--;
    const start = end - (to - from);
    editor.setSelection(
        { line: start, ch: 0 },
        { line: end, ch: editor.getLine(end).length },
    );
}

/**
 * Open a modal to pick a tag and toggle it at the end of each selected list item.
 *
 * `tags` comes from the settings, where a row left blank would otherwise offer a
 * choice that tags nothing, so empty entries are dropped here.
 */
export function insertTag(app: App, editor: Editor, tags: string[]): void {
    const { from, to } = selectedLineRange(editor);
    const choices = tags.map((t) => t.trim()).filter((t) => t.length > 0);

    new TagSuggestModal(app, choices, (tag: string) => {
        const tagRe = new RegExp(`(?<!\\w)#${tag}\\b`);
        for (let i = from; i <= to; i++) {
            const line = editor.getLine(i);
            if (!/^\s*[-*]\s/.test(line)) continue;
            if (tagRe.test(line)) {
                editor.setLine(i, line.replace(new RegExp(` ?#${tag}\\b ?`, 'g'), (m, offset, str: string) => {
                    if (offset === 0) return '';
                    if (offset + m.length === str.length) return '';
                    return ' ';
                }));
            } else {
                const separator = line.endsWith(' ') ? '' : ' ';
                editor.setLine(i, line + separator + `#${tag}`);
            }
        }
    }).open();
}

/** Matches an occurrence of `#tag`, not preceded by a word character. */
function tagPresence(tag: string): RegExp {
    return new RegExp(`(?<!\\w)#${tag}\\b`);
}

/**
 * The line with every `#tag` removed, collapsing the space it leaves behind so
 * no double space or trailing space remains.
 */
function stripTag(line: string, tag: string): string {
    const strip = new RegExp(` ?(?<!\\w)#${tag}\\b ?`, 'g');
    return line.replace(strip, (m, offset: number, str: string) => {
        if (offset === 0) return '';
        if (offset + m.length === str.length) return '';
        return ' ';
    });
}

/** Toggle a `#tag` on each selected list item. */
export function toggleTag(editor: Editor, tag: string): void {
    const present = tagPresence(tag);
    const { from, to } = selectedLineRange(editor);
    for (let i = from; i <= to; i++) {
        const line = editor.getLine(i);
        if (!/^\s*[-*]\s/.test(line)) continue;
        if (present.test(line)) {
            editor.setLine(i, stripTag(line, tag));
        } else {
            editor.setLine(i, line + ` #${tag}`);
        }
    }
}

/**
 * Remove a `#tag` from every list item in every note whose frontmatter `type`
 * is "taken".
 *
 * Only list items are touched, matching {@link toggleTag}: the tag is a marker
 * on a task, and an occurrence in prose or in frontmatter is not one.
 */
export async function removeTagFromTakenNotes(app: App, tag: string): Promise<void> {
    const present = tagPresence(tag);

    const files = app.vault.getMarkdownFiles().filter((file) => {
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'taken';
    });

    let notes = 0;
    let lines = 0;

    for (const file of files) {
        let changed = 0;
        await app.vault.process(file, (content) => {
            const result = content.split('\n').map((line) => {
                if (!/^\s*[-*]\s/.test(line)) return line;
                if (!present.test(line)) return line;
                changed++;
                return stripTag(line, tag);
            });
            return changed > 0 ? result.join('\n') : content;
        });
        if (changed > 0) {
            notes++;
            lines += changed;
        }
    }

    new Notice(
        notes === 0
            ? `No #${tag} tags found in "taken" notes`
            : `Removed ${lines} #${tag} tag(s) from ${notes} note(s)`,
    );
}

/** Move the selected lines to a chosen note via a fuzzy-search modal. */
export function moveLinesToNote(app: App, editor: Editor): void {
    const { from, to } = selectedLineRange(editor);
    const text = getSelectedLinesText(editor);

    new NoteSuggestModal(app, async (file: TFile) => {
        const content = await app.vault.read(file);
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        await app.vault.modify(file, content + separator + text + '\n');

        removeLines(editor, from, to);

        new Notice(`Moved to ${file.basename}`);
    }).open();
}

/** Insert an internal link to a chosen active project at the cursor via a fuzzy-search modal. */
export function insertProjectLink(app: App, editor: Editor): void {
    const projects = app.vault.getMarkdownFiles().filter((file) => {
        const fm = app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== 'project') return false;
        return fm.status !== 'klaar' && fm.status !== 'geannuleerd';
    });

    new NoteSuggestModal(
        app,
        (file: TFile) => {
            const link = app.fileManager.generateMarkdownLink(file, file.path);
            editor.replaceSelection(link);
        },
        projects,
    ).open();
}

/** Project statuses, in Dutch. */
const PROJECT_STATUSES = ['actief', 'klaar', 'backlog', 'misschien', 'geannuleerd'];

/**
 * Pick an active project via a fuzzy-search modal and append a link to it to the
 * active note's `project` frontmatter list.
 */
export function addProjectToFrontmatter(app: App): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
        new Notice('No active note');
        return;
    }
    const file = view.file;

    const projects = app.vault.getMarkdownFiles().filter((f) => {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (fm?.type !== 'project') return false;
        return fm.status !== 'klaar' && fm.status !== 'geannuleerd';
    });

    new NoteSuggestModal(
        app,
        (project: TFile) => {
            const link = app.fileManager.generateMarkdownLink(project, file.path);
            app.fileManager.processFrontMatter(file, (fm) => {
                const current = fm.project;
                const list = Array.isArray(current)
                    ? current
                    : current != null
                        ? [current]
                        : [];
                if (!list.includes(link)) list.push(link);
                fm.project = list;
            });
            new Notice(`Added project ${project.basename}`);
        },
        projects,
    ).open();
}

/**
 * Pick a project status via a modal and set it as the active note's `status`
 * frontmatter field.
 */
export function setStatusInFrontmatter(app: App): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
        new Notice('No active note');
        return;
    }
    const file = view.file;

    new StringSuggestModal(app, PROJECT_STATUSES, (status: string) => {
        app.fileManager.processFrontMatter(file, (fm) => {
            fm.status = status;
        });
        new Notice(`Set status to ${status}`);
    }).open();
}

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/**
 * Merge every note in "1-taken" with frontmatter `type: taken` into a single new
 * note, most recent content first, then delete the originals.
 */
export async function mergeTakenNotes(app: App): Promise<void> {
    const sourceFolder = '1-taken';

    const files = app.vault.getMarkdownFiles().filter((file) => {
        if (!file.path.startsWith(`${sourceFolder}/`)) return false;
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'taken';
    });

    if (files.length === 0) {
        new Notice('No "taken" notes found');
        return;
    }

    // Most recent creation date first.
    files.sort((a, b) => b.stat.ctime - a.stat.ctime);

    const sections: string[] = [];
    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const raw = await app.vault.cachedRead(file);
        const bodyStart = cache?.frontmatterPosition
            ? cache.frontmatterPosition.end.line + 1
            : 0;
        const lines = raw.split('\n');
        const body = lines.slice(bodyStart).join('\n').replace(/^\n+/, '').trimEnd();

        sections.push(`## ${file.basename}\n\n${body}`);
    }

    const now = new Date();
    const noteName =
        `${String(now.getFullYear()).slice(2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
        `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

    const datum = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

    const frontmatter =
        `---\n` +
        `datum: ${datum}\n` +
        `type: taken\n` +
        `cssclasses:\n` +
        `  - kleiner\n` +
        `  - kleur\n` +
        `---\n\n`;

    const content = frontmatter + sections.join('\n\n');

    const dest = `${sourceFolder}/${noteName}.md`;
    await app.vault.create(dest, content);

    for (const file of files) {
        await app.vault.delete(file);
    }

    new Notice(`Merged ${files.length} note(s) into ${noteName}`);
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
