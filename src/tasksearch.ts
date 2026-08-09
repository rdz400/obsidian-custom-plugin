import {
    App,
    ListItemCache,
    Notice,
    SuggestModal,
    TFile,
} from 'obsidian';

import { FilterBar, FilterChip } from './filterbar';
import { openFileFromSearch, registerNewTabEnter } from './openfile';

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
 * Wikilinks are kept in place: stripping them mangles sentences built around
 * them ("- [ ] Bel [[Jan]] over de tuin") and empties a task that is nothing
 * but a link. They are styled where they stand, with their brackets, so they
 * stay recognisable as links, see `textParts`.
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

/** The comparable form of a query: lowercased, with a leading "#" dropped. */
function normaliseQuery(query: string): string {
    return query.toLowerCase().replace(/^#/, '');
}

/**
 * Open the note `task` lives in and put the cursor on its line, in a new tab
 * when `event` carries the command modifier.
 */
function openTask(app: App, task: TaskItem, event?: MouseEvent | KeyboardEvent): void {
    openFileFromSearch(app, task.file, event, {
        eState: { line: task.line, cursor: { from: { line: task.line, ch: 0 } } },
    });
}

/** How the modal treats tasks that are already ticked off. */
export interface TaskSearchOptions {
    /**
     * Whether finished tasks take part in the search at all.
     *
     * There is deliberately no chip for this: the answer is nearly always "no",
     * and a chip would spend a shortcut on a switch that is never flipped. It
     * stays a parameter so showing them again is a one-line change at the call
     * site rather than a rewrite here.
     */
    showDone?: boolean;
    /** Text to put in the search field, as if the user had typed it. */
    query?: string;
    /** Tag values to switch on up front; values with no chip are ignored. */
    activeTags?: readonly string[];
}

/**
 * Search tasks across all "taken" notes by text, with clickable tag filters.
 *
 * Choosing a task opens its note at the right line — in the active tab, or in a
 * new one with Mod+Enter; ticking its checkbox writes the marker straight back
 * to the note without leaving the modal.
 */
export class TaskSearchModal extends SuggestModal<TaskItem> {
    private items: TaskItem[];
    private readonly filters: FilterBar;
    private readonly filterTags: readonly FilterChip[];
    private readonly initialQuery: string;

    constructor(
        app: App,
        items: TaskItem[],
        filterTags: readonly FilterChip[],
        options: TaskSearchOptions = {},
    ) {
        super(app);
        // Filtered once here rather than on every keystroke: a task ticked
        // inside the modal stays on screen until it is reopened, so the row the
        // user just clicked does not vanish from under the cursor.
        this.items = options.showDone === true ? items : items.filter((task) => !task.done);
        this.filterTags = filterTags;
        this.setPlaceholder('Search tasks…');
        this.modalEl.addClass('ronald-task-search');
        registerNewTabEnter(this);

        this.filters = new FilterBar({
            chips: filterTags,
            onChange: () => this.rerunSearch(),
        });
        this.mountFilters();

        // Toggled before the modal is on screen, so the first render already
        // shows the preset selection; `toggle` drops values with no chip.
        for (const tag of options.activeTags ?? []) {
            this.filters.toggle(tag);
        }

        this.initialQuery = options.query ?? '';

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bar is on screen before that, so seed it here.
        this.filters.setCounts(this.tagCounts(normaliseQuery(this.initialQuery)));
    }

    /**
     * Seed the search field once the modal is up.
     *
     * The value has to be written after `super.onOpen` has run: Obsidian renders
     * the empty result list on open, and setting the text before that would be
     * overwritten by it. `rerunSearch` then produces the matches, which typing
     * would otherwise be needed for.
     */
    onOpen(): void {
        void super.onOpen();
        if (this.initialQuery.length === 0) return;

        this.inputEl.value = this.initialQuery;
        // Leaves the cursor at the end so the query reads as typed and can be
        // edited or cleared straight away.
        this.inputEl.setSelectionRange(this.initialQuery.length, this.initialQuery.length);
        this.rerunSearch();
    }

    /**
     * Place the tag chips and give them their keyboard shortcuts.
     *
     * The bar sits between the search field and the results, so it stays
     * visible while typing rather than scrolling away with the matches.
     *
     * Shortcuts are listened for on the modal rather than the input so they
     * work wherever focus sits, in the capture phase so Obsidian's own Mod+digit
     * bindings never see a press meant for a chip.
     */
    private mountFilters(): void {
        this.inputEl.parentElement?.insertAdjacentElement('afterend', this.filters.el);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!this.filters.handleKeyDown(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
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

    /** True when the task carries every tag in `wanted` (nested tags count). */
    private matchesTags(task: TaskItem, wanted: Iterable<string>): boolean {
        return [...wanted].every((want) =>
            task.tags.some((tag) => tag === want || tag.startsWith(`${want}/`)),
        );
    }

    /** True when the query appears in the task's text, tags or links. */
    private matchesQuery(task: TaskItem, q: string): boolean {
        // Match the tags and links too: tags are stripped out of the text, and
        // a link inherited from an ancestor never appears in it, so both would
        // otherwise be unsearchable.
        return (
            task.text.toLowerCase().includes(q) ||
            task.tags.some((tag) => tag.includes(q)) ||
            task.links.some((link) => link.toLowerCase().includes(q))
        );
    }

    getSuggestions(query: string): TaskItem[] {
        const q = normaliseQuery(query);
        const matches = this.items.filter(
            (task) =>
                this.matchesTags(task, this.filters.activeValues) &&
                this.matchesQuery(task, q),
        );

        this.filters.setCounts(this.tagCounts(q));
        return matches;
    }

    /**
     * How many tasks each chip stands for, given the query and the other chips.
     *
     * The number answers "what happens if I press this?", so a chip is counted
     * against the filters *other* than itself: an inactive chip shows what
     * turning it on would leave, and an active one shows how many tasks it is
     * currently letting through — which for the only active chip is simply the
     * result count. Counting against all active filters instead would make
     * every inactive chip read as its own intersection with the selection, but
     * an active chip would then always equal the result count, which tells the
     * reader nothing.
     */
    private tagCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();

        for (const { value: tag } of this.filterTags) {
            const others = [...this.filters.activeValues].filter((active) => active !== tag);
            const total = this.items.filter(
                (task) =>
                    this.matchesTags(task, [...others, tag]) && this.matchesQuery(task, q),
            ).length;
            counts.set(tag, total);
        }

        return counts;
    }

    renderSuggestion(task: TaskItem, el: HTMLElement): void {
        el.addClass('ronald-task-match');
        if (task.done) el.addClass('is-done');

        // Drives the depth badge in CSS. Nesting has no fixed limit but the
        // shades run out, so anything deeper is styled as the last level.
        el.dataset.depth = String(Math.min(task.depth, 3));

        const checkbox = el.createEl('input', {
            type: 'checkbox',
            cls: 'ronald-task-checkbox',
        });
        checkbox.checked = task.done;
        this.wireCheckbox(checkbox, el, task);

        const body = el.createDiv({ cls: 'ronald-task-body' });

        // Wikilinks keep their place in the sentence and are styled as links.
        const line = body.createDiv({ cls: 'ronald-task-text' });
        for (const part of textParts(task.text)) {
            if (part.link) line.createSpan({ cls: 'ronald-task-inline-link', text: part.text });
            else line.appendText(part.text);
        }

        // Links are left out: they are already styled inline in the text above.
        if (task.tags.length > 0) {
            const meta = body.createDiv({ cls: 'ronald-task-meta' });

            for (const tag of task.tags) {
                meta.createSpan({ cls: 'ronald-task-tag', text: `#${tag}` });
            }
        }

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

    onChooseSuggestion(task: TaskItem, event: MouseEvent | KeyboardEvent): void {
        openTask(this.app, task, event);
    }
}

/**
 * Collect the tasks in all "taken" notes and open the search modal.
 *
 * A tag left blank in the settings would render a chip that filters on nothing,
 * so half-finished rows are dropped rather than shown.
 */
export async function searchTasks(
    app: App,
    filterTags: readonly FilterChip[],
    options: TaskSearchOptions = {},
): Promise<void> {
    const tasks = await collectTakenTasks(app);

    if (tasks.length === 0) {
        new Notice('No tasks found in "taken" notes');
        return;
    }

    const chips = filterTags.filter((chip) => chip.value.length > 0);
    new TaskSearchModal(app, tasks, chips, options).open();
}
