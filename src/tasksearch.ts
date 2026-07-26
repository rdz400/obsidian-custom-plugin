import {
    App,
    ListItemCache,
    Notice,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

/** Tag chips offered as one-click filters under the search field. */
const FILTER_TAGS = ['buiten', 'vandaag', 'thuis', 'week'];

/** One task line found in a "taken" note, with everything shown for it. */
export interface TaskItem {
    file: TFile;
    /** Line number at collection time; only a hint, the file may change before a write. */
    line: number;
    /** The full raw source line, used to verify the line hint still points at this task. */
    raw: string;
    /** The task text with list marker, checkbox and tags stripped out. */
    text: string;
    /** True when the checkbox is ticked. */
    done: boolean;
    /** How deeply the task is nested: 1 for a top-level item, 2 under it, etc. */
    depth: number;
    /** Own tags first, then those inherited from ancestors. */
    tags: string[];
    /** Own links first, then those inherited from ancestors. */
    links: string[];
}

const TASK_LINE_RE = /^(\s*[-*+]\s+)\[([^\]])\]\s?/;
const TAG_RE = /#([\w/-]+)/g;
const LINK_RE = /\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** Set the checkbox marker of a task line, e.g. "- [ ] Foo" -> "- [x] Foo". */
function setTaskMarker(line: string, marker: string): string {
    return line.replace(/^(\s*[-*+]\s+)\[[^\]]\]/, `$1[${marker}]`);
}

/** The inline "#tag"s written on one line, lowercased. */
function tagsOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(TAG_RE)).map((m) => (m[1] as string).toLowerCase());
}

/** The wikilink targets on one line, using the display text where given. */
function linksOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(LINK_RE)).map(
        (m) => (m[2] ?? m[1] ?? '').trim(),
    );
}

/**
 * The readable part of a list line: marker, checkbox and tags removed, since
 * tags are rendered as their own chips beside the text.
 *
 * Wikilinks are kept in place: they also get a chip, but stripping them here
 * mangles sentences built around them ("- [ ] Bel [[Jan]] over de tuin") and
 * empties a task that is nothing but a link. They are displayed with their
 * brackets so they stay recognisable as links, see `textParts`.
 */
function taskText(raw: string): string {
    return raw
        .replace(/^\s*[-*+]\s+(?:\[[^\]]\]\s?)?/, '')
        .replace(TAG_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** A run of task text: either plain words or a single wikilink. */
export interface TextPart {
    text: string;
    link: boolean;
}

/**
 * Split task text into plain runs and wikilinks, so the links can be given
 * their own styling while keeping their position in the sentence.
 *
 * A link is shown by its display text where the source gives one, wrapped back
 * in "[[…]]" so it reads as a link without being clickable.
 */
export function textParts(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let at = 0;

    for (const match of text.matchAll(LINK_RE)) {
        const start = match.index;
        const plain = text.slice(at, start);
        if (plain.length > 0) parts.push({ text: plain, link: false });

        const label = (match[2] ?? match[1] ?? '').trim();
        parts.push({ text: `[[${label}]]`, link: true });
        at = start + match[0].length;
    }

    const rest = text.slice(at);
    if (rest.length > 0) parts.push({ text: rest, link: false });

    return parts;
}

/** Append the entries of `extra` that `into` doesn't already have. */
function addMissing(into: string[], extra: string[]): string[] {
    return [...into, ...extra.filter((entry) => !into.includes(entry))];
}

/**
 * Collect every checkbox line in `file` as a flat list of items.
 *
 * `listItems` is flat and ordered by position, with `parent` holding the start
 * line of the containing item (negative for a top-level item, where it encodes
 * the section instead). Since a parent always appears before its children, one
 * forward pass indexed by start line is enough to accumulate each line's own
 * tags and links on top of everything its ancestors carry — which is how a
 * subtask inherits the context of the bullet or task it hangs under. The same
 * pass counts the depth: one more than the depth of the parent item.
 *
 * Plain bullets take part in that inheritance but are not collected themselves:
 * only checkboxes are tasks. They do count towards the depth, so a subtask of a
 * plain bullet is at depth 2 just like a subtask of a task.
 */
function collectFileTasks(
    items: ListItemCache[],
    lines: string[],
    file: TFile,
): TaskItem[] {
    const inherited = new Map<
        number,
        { tags: string[]; links: string[]; depth: number }
    >();
    const tasks: TaskItem[] = [];

    for (const item of items) {
        const line = item.position.start.line;
        const raw = lines[line];
        if (raw === undefined) continue;

        const parent = item.parent < 0 ? undefined : inherited.get(item.parent);
        const tags = addMissing(tagsOnLine(raw), parent?.tags ?? []);
        const links = addMissing(linksOnLine(raw), parent?.links ?? []);
        const depth = (parent?.depth ?? 0) + 1;
        inherited.set(line, { tags, links, depth });

        const marker = TASK_LINE_RE.exec(raw)?.[2];
        if (marker === undefined) continue;

        tasks.push({
            file,
            line,
            raw,
            text: taskText(raw),
            done: marker === 'x' || marker === 'X',
            depth,
            tags,
            links,
        });
    }

    return tasks;
}

/** Every task in every note whose frontmatter `type` is "taken". */
export async function collectTakenTasks(app: App): Promise<TaskItem[]> {
    const files = app.vault
        .getMarkdownFiles()
        .filter(
            (file) =>
                app.metadataCache.getFileCache(file)?.frontmatter?.type === 'taken',
        );

    const tasks: TaskItem[] = [];

    for (const file of files) {
        const items = app.metadataCache.getFileCache(file)?.listItems ?? [];
        if (items.length === 0) continue;

        const lines = (await app.vault.cachedRead(file)).split('\n');
        tasks.push(...collectFileTasks(items, lines, file));
    }

    return tasks;
}

/**
 * Write the new checkbox marker for `task` back into its source note.
 *
 * Uses `vault.process` so the read-modify-write is atomic. The line number
 * captured at collection time goes stale as soon as anything above the task
 * changes, so it is only trusted when the text there still matches; otherwise
 * we fall back to a content search and give up when the text is absent or
 * ambiguous, rather than rewriting an unrelated line.
 */
async function writeTaskMarker(
    app: App,
    task: TaskItem,
    marker: string,
): Promise<boolean> {
    let written = false;

    await app.vault.process(task.file, (data) => {
        const lines = data.split('\n');

        let index = lines[task.line] === task.raw ? task.line : -1;
        if (index === -1) {
            const matches = lines.flatMap((line, i) => (line === task.raw ? [i] : []));
            if (matches.length !== 1) return data;
            index = matches[0] as number;
        }

        const current = lines[index];
        if (current === undefined) return data;

        lines[index] = setTaskMarker(current, marker);
        written = true;
        return lines.join('\n');
    });

    return written;
}

/** Open the note `task` lives in and put the cursor on its line. */
function openTask(app: App, task: TaskItem): void {
    const leaf =
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ??
        app.workspace.getLeaf(false);
    void leaf.openFile(task.file, {
        eState: { line: task.line, cursor: { from: { line: task.line, ch: 0 } } },
    });
}

/**
 * Search tasks across all "taken" notes by text, with clickable tag filters.
 *
 * Choosing a task opens its note at the right line; ticking its checkbox writes
 * the marker straight back to the note without leaving the modal.
 */
export class TaskSearchModal extends SuggestModal<TaskItem> {
    private items: TaskItem[];
    private activeTags = new Set<string>();

    constructor(app: App, items: TaskItem[]) {
        super(app);
        this.items = items;
        this.setPlaceholder('Search tasks…');
        this.modalEl.addClass('ronald-task-search');
        this.renderTagFilters();
    }

    /** The tag chips under the search field, toggling their filter on click. */
    private renderTagFilters(): void {
        const bar = createDiv({ cls: 'ronald-task-filters' });

        for (const tag of FILTER_TAGS) {
            const chip = bar.createSpan({
                cls: 'ronald-task-filter',
                text: `#${tag}`,
            });
            chip.addEventListener('click', () => {
                if (this.activeTags.has(tag)) this.activeTags.delete(tag);
                else this.activeTags.add(tag);
                chip.toggleClass('is-active', this.activeTags.has(tag));
                this.rerunSearch();
            });
        }

        // Sits between the search field and the results, so it stays visible
        // while typing rather than scrolling away with the matches.
        this.inputEl.parentElement?.insertAdjacentElement('afterend', bar);
    }

    /**
     * Re-run the current query so the results reflect a changed tag filter.
     *
     * `onInput` is what Obsidian's own input listener calls; it replaces the
     * result list in place. Dispatching an `input` event instead appends a
     * second set of results on top of the old ones, so it is not an option.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    /** True when the task carries every active filter tag (nested tags count). */
    private matchesTags(task: TaskItem): boolean {
        return [...this.activeTags].every((wanted) =>
            task.tags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`)),
        );
    }

    getSuggestions(query: string): TaskItem[] {
        // Match the tags and links too: tags are stripped out of the text, and
        // a link inherited from an ancestor never appears in it, so both would
        // otherwise be unsearchable.
        const q = query.toLowerCase().replace(/^#/, '');
        return this.items.filter(
            (task) =>
                this.matchesTags(task) &&
                (task.text.toLowerCase().includes(q) ||
                    task.tags.some((tag) => tag.includes(q)) ||
                    task.links.some((link) => link.toLowerCase().includes(q))),
        );
    }

    renderSuggestion(task: TaskItem, el: HTMLElement): void {
        el.addClass('ronald-task-match');
        if (task.done) el.addClass('is-done');

        const checkbox = el.createEl('input', {
            type: 'checkbox',
            cls: 'ronald-task-checkbox',
        });
        checkbox.checked = task.done;
        this.wireCheckbox(checkbox, el, task);

        const body = el.createDiv({ cls: 'ronald-task-body' });

        // Wikilinks keep their place in the sentence and are styled as links,
        // rather than being pulled out into the chips below.
        const line = body.createDiv({ cls: 'ronald-task-text' });
        for (const part of textParts(task.text)) {
            if (part.link) line.createSpan({ cls: 'ronald-task-inline-link', text: part.text });
            else line.appendText(part.text);
        }

        if (task.tags.length > 0 || task.links.length > 0) {
            const meta = body.createDiv({ cls: 'ronald-task-meta' });

            for (const tag of task.tags) {
                meta.createSpan({ cls: 'ronald-task-tag', text: `#${tag}` });
            }

            for (const link of task.links) {
                const pill = meta.createSpan({ cls: 'ronald-task-link' });
                setIcon(pill.createSpan(), 'link');
                pill.createSpan({ text: link });
            }
        }

        body.createDiv({ cls: 'ronald-task-note', text: task.file.basename });

        // Last, so it sits in the empty space at the right edge of the row.
        el.createSpan({
            cls: 'ronald-task-depth',
            text: String(task.depth),
            attr: { 'aria-label': `Nesting level ${task.depth}` },
        });
    }

    /**
     * Toggle the task in its source note when the checkbox is clicked.
     *
     * The click is kept away from the suggestion itself so ticking a box does
     * not also open the note and close the modal. The UI is updated straight
     * away and rolled back if the write fails, since waiting for the vault
     * would leave the box visibly unresponsive.
     */
    private wireCheckbox(
        checkbox: HTMLInputElement,
        el: HTMLElement,
        task: TaskItem,
    ): void {
        const stop = (event: Event) => event.stopPropagation();
        checkbox.addEventListener('mousedown', stop);
        checkbox.addEventListener('click', async (event) => {
            stop(event);

            // The browser has already flipped `checked`, so this is the state
            // the user just asked for.
            const desired = checkbox.checked;
            el.toggleClass('is-done', desired);

            checkbox.disabled = true;
            let ok = false;
            try {
                ok = await writeTaskMarker(this.app, task, desired ? 'x' : ' ');
            } finally {
                checkbox.disabled = false;
            }

            if (ok) {
                // Keep the in-memory task in sync so a second click still finds
                // its line, and so a re-render shows the new state.
                task.raw = setTaskMarker(task.raw, desired ? 'x' : ' ');
                task.done = desired;
            } else {
                checkbox.checked = !desired;
                el.toggleClass('is-done', !desired);
                new Notice(
                    `Could not update task in "${task.file.basename}": the note changed.`,
                );
            }
        });
    }

    onChooseSuggestion(task: TaskItem): void {
        openTask(this.app, task);
    }
}

/** Collect the tasks in all "taken" notes and open the search modal. */
export async function searchTasks(app: App): Promise<void> {
    const tasks = await collectTakenTasks(app);

    if (tasks.length === 0) {
        new Notice('No tasks found in "taken" notes');
        return;
    }

    new TaskSearchModal(app, tasks).open();
}
