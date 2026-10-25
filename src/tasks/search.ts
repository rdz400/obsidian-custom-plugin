import {
    App,
    Notice,
    SuggestModal,
    TFile,
} from 'obsidian';

import { LINK_RE, TAG_RE } from '../shared/markdown';
import { FilterBar, FilterChip } from '../shared/ui/filterbar';
import { openFileFromSearch, registerNewTabEnter } from '../shared/ui/openfile';
import type { TaskSettings } from './settings';
import { isDoneMarker } from '../shared/taskline';
import { readTaskNoteLines } from '../shared/tasknotes';
import { GTD_NOTES, type GtdNote, gtdNoteOf } from './gtdnotes';
import { type TaskNoteBadge, taskNoteBadge } from './tasknotes';

/** One task line found in a task note, with everything shown for it. */
export interface TaskItem {
    file: TFile;
    /** Which note the task is in, as shown next to its nesting level. */
    note: TaskNoteBadge;
    /** Which GTD note the task is in, if it is in one; what the note chips filter on. */
    gtd: GtdNote['id'] | undefined;
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
    /** Own link targets first, then those inherited from ancestors. */
    links: string[];
}

/** Set the checkbox marker of a task line, e.g. "- [ ] Foo" -> "- [x] Foo". */
function setTaskMarker(line: string, marker: string): string {
    return line.replace(/^(\s*[-*+]\s+)\[[^\]]\]/, `$1[${marker}]`);
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

/**
 * Every task in every task note, the notes directly in the task folder.
 *
 * Plain bullets pass their tags and links on to the tasks below them and count
 * towards their depth, see `listLines`, but are not collected themselves: only
 * checkboxes are tasks.
 */
export async function collectTaskNoteTasks(
    app: App,
    settings: TaskSettings,
): Promise<TaskItem[]> {
    const tasks: TaskItem[] = [];

    for (const { file, lines } of await readTaskNoteLines(app, settings.taskFolder)) {
        const note = taskNoteBadge(file, settings);
        const gtd = gtdNoteOf(file, settings)?.id;

        for (const { line, raw, marker, depth, tags, links } of lines) {
            if (marker === undefined) continue;
            tasks.push({
                file,
                note,
                gtd,
                line,
                raw,
                text: taskText(raw),
                done: isDoneMarker(marker),
                depth,
                tags,
                links,
            });
        }
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
    /** GTD notes to switch on up front ("today", "inbox", …); values with no chip are ignored. */
    activeNotes?: readonly string[];
}

/**
 * Search tasks across all task notes by text, with clickable tag filters and,
 * in a second row, filters on the GTD note a task is in.
 *
 * Choosing a task opens its note at the right line — in the active tab, or in a
 * new one with Mod+Enter; ticking its checkbox writes the marker straight back
 * to the note without leaving the modal.
 */
export class TaskSearchModal extends SuggestModal<TaskItem> {
    private items: TaskItem[];
    private readonly filters: FilterBar;
    private readonly noteFilters: FilterBar;
    private readonly filterTags: readonly FilterChip[];
    private readonly filterNotes: readonly FilterChip[];
    private readonly initialQuery: string;

    constructor(
        app: App,
        items: TaskItem[],
        filterTags: readonly FilterChip[],
        filterNotes: readonly FilterChip[],
        options: TaskSearchOptions = {},
    ) {
        super(app);
        // Filtered once here rather than on every keystroke: a task ticked
        // inside the modal stays on screen until it is reopened, so the row the
        // user just clicked does not vanish from under the cursor.
        this.items = options.showDone === true ? items : items.filter((task) => !task.done);
        this.filterTags = filterTags;
        this.filterNotes = filterNotes;
        this.setPlaceholder('Search tasks…');
        this.modalEl.addClass('ronald-task-search');
        registerNewTabEnter(this);

        this.filters = new FilterBar({
            chips: filterTags,
            onChange: () => this.rerunSearch(),
        });
        this.noteFilters = new FilterBar({
            chips: filterNotes,
            onChange: () => this.rerunSearch(),
            // Its own modifier, so both rows can number their chips from 1.
            modifier: 'alt',
        });
        this.mountFilters();

        // Toggled before the modal is on screen, so the first render already
        // shows the preset selection; `toggle` drops values with no chip.
        for (const tag of options.activeTags ?? []) {
            this.filters.toggle(tag);
        }
        for (const note of options.activeNotes ?? []) {
            this.noteFilters.toggle(note);
        }

        this.initialQuery = options.query ?? '';

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bars are on screen before that, so seed them here.
        this.setCounts(normaliseQuery(this.initialQuery));
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
     * Place both chip rows and give them their keyboard shortcuts.
     *
     * The bars sit between the search field and the results, so they stay
     * visible while typing rather than scrolling away with the matches.
     *
     * Shortcuts are listened for on the modal rather than the input so they
     * work wherever focus sits, in the capture phase so Obsidian's own Mod+digit
     * bindings never see a press meant for a chip.
     *
     * Each bar answers to its own modifier, so both number their chips from 1
     * without colliding: the tags are Mod+1…9, the GTD notes Alt+1…4. A press
     * is offered to each in turn and at most one takes it.
     */
    private mountFilters(): void {
        this.inputEl.parentElement?.insertAdjacentElement('afterend', this.filters.el);
        this.filters.el.insertAdjacentElement('afterend', this.noteFilters.el);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                const handled =
                    this.filters.handleKeyDown(event) || this.noteFilters.handleKeyDown(event);
                if (!handled) return;
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

    /**
     * True when the task is in one of the GTD notes in `wanted` (or `wanted`
     * is empty, in which case every task matches).
     *
     * A task is in one note only, so unlike the tags this is an OR across the
     * active chips: "today" and "inbox" together show the tasks of both.
     */
    private matchesNote(task: TaskItem, wanted: ReadonlySet<string>): boolean {
        return wanted.size === 0 || (task.gtd !== undefined && wanted.has(task.gtd));
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
                this.matchesNote(task, this.noteFilters.activeValues) &&
                this.matchesQuery(task, q),
        );

        this.setCounts(q);
        return matches;
    }

    /** Bring the counts on both chip rows up to date with the query and the chips. */
    private setCounts(q: string): void {
        this.filters.setCounts(this.tagCounts(q));
        this.noteFilters.setCounts(this.noteCounts(q));
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
     *
     * The note row ANDs with this one, so its active chips narrow every count.
     */
    private tagCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();
        const wantedNotes = this.noteFilters.activeValues;

        for (const { value: tag } of this.filterTags) {
            const others = [...this.filters.activeValues].filter((active) => active !== tag);
            const total = this.items.filter(
                (task) =>
                    this.matchesTags(task, [...others, tag]) &&
                    this.matchesNote(task, wantedNotes) &&
                    this.matchesQuery(task, q),
            ).length;
            counts.set(tag, total);
        }

        return counts;
    }

    /**
     * How many tasks each GTD note chip stands for, given the query and the tags.
     *
     * Note chips are OR'd together (see `matchesNote`), so turning one on only
     * ever adds its own tasks to the result, whichever other note chips are
     * active: the count is how many tasks in that note match the query and
     * the active tags.
     */
    private noteCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();
        const wantedTags = this.filters.activeValues;

        for (const { value: note } of this.filterNotes) {
            const total = this.items.filter(
                (task) =>
                    task.gtd === note &&
                    this.matchesTags(task, wantedTags) &&
                    this.matchesQuery(task, q),
            ).length;
            counts.set(note, total);
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

        // Last, so they sit in the empty space at the right edge of the row:
        // which note the task is in, then how deeply it is nested.
        const badges = el.createDiv({ cls: 'ronald-task-badges' });
        badges.createSpan({
            cls: 'ronald-task-note',
            text: task.note.letter,
            attr: { 'aria-label': `In ${task.note.label}` },
        });
        badges.createSpan({
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
 * Collect the tasks in all task notes and open the search modal.
 *
 * The settings give the task folder, the GTD notes the badges and note chips
 * name, and the tag chips. A tag left blank there would render a chip that
 * filters on nothing, so half-finished rows are dropped rather than shown; so
 * is the chip of a GTD note that isn't set.
 */
export async function searchTasks(
    app: App,
    settings: TaskSettings,
    options: TaskSearchOptions = {},
): Promise<void> {
    const tasks = await collectTaskNoteTasks(app, settings);

    if (tasks.length === 0) {
        new Notice(`No tasks found in ${settings.taskFolder || 'task notes'}`);
        return;
    }

    const chips = settings.taskFilterTags.filter((chip) => chip.value.length > 0);
    const noteChips = GTD_NOTES.filter((note) => settings[note.key].length > 0).map(
        (note): FilterChip => ({ value: note.id, type: 'gtd', label: note.name }),
    );
    new TaskSearchModal(app, tasks, chips, noteChips, options).open();
}
