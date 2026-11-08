import {
    App,
    Notice,
    setIcon,
    SuggestModal,
} from 'obsidian';

import { FilterBar, FilterChip } from '../shared/ui/filterbar';
import { openFileFromSearch, registerNewTabEnter } from '../shared/ui/openfile';
import type { TaskSettings } from './settings';
import { GTD_NOTES } from './gtdnotes';
import { findTaskLine, setTaskMarker, type TaskItem, textParts } from './taskitems';
import { collectTaskNoteTasks } from './tasknotes';

/**
 * Write the new checkbox marker for `task` back into its source note.
 *
 * Uses `vault.process` so the read-modify-write is atomic, and finds the task
 * by its text (see `findTaskLine`), giving up when that is absent or
 * ambiguous rather than rewriting an unrelated line.
 */
async function writeTaskMarker(
    app: App,
    task: TaskItem,
    marker: string,
): Promise<boolean> {
    let written = false;

    await app.vault.process(task.file, (data) => {
        const lines = data.split('\n');

        const index = findTaskLine(lines, task);
        if (index === undefined) return data;

        const current = lines[index];
        if (current === undefined) return data;

        lines[index] = setTaskMarker(current, marker);
        written = true;
        return lines.join('\n');
    });

    return written;
}

/** How long a touch has to be held before it toggles the task, in ms. */
const LONG_PRESS_MS = 500;

/** How far a finger may drift during a long press before it counts as a scroll, in px. */
const LONG_PRESS_SLOP = 10;

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
 * new one with Mod+Enter. Mod+L, or a long press on a touch screen, ticks the
 * task off (or back on) and writes the marker straight back to the note
 * without leaving the modal.
 */
export class TaskSearchModal extends SuggestModal<TaskItem> {
    private items: TaskItem[];
    /** The task each rendered row stands for, so a key press can find the selected one. */
    private readonly rowTasks = new WeakMap<HTMLElement, TaskItem>();
    /** Tasks with a write in flight, so a second toggle waits for the first. */
    private readonly pending = new Set<TaskItem>();
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
        this.registerToggleKey();

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
     * Make Mod+L tick off the highlighted task, the key Obsidian itself uses
     * to toggle a checkbox in the editor.
     *
     * The highlighted row is read from the DOM rather than from the modal's
     * private chooser: it is the one Obsidian marks `is-selected`, whether
     * the arrow keys or the mouse put it there. Returning false keeps the
     * press from reaching the editor behind the modal.
     */
    private registerToggleKey(): void {
        this.scope.register(['Mod'], 'l', () => {
            const row = this.resultContainerEl.querySelector<HTMLElement>(
                '.suggestion-item.is-selected',
            );
            const task = row ? this.rowTasks.get(row) : undefined;
            if (row && task) void this.toggleTask(task, row);
            return false;
        });
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

        // Drives how far the subtask arrow is indented in CSS. Nesting has no
        // fixed limit, but past a few levels the steps would eat the text's
        // room, so anything deeper is styled as the last level.
        el.dataset.depth = String(Math.min(task.depth, 4));

        // Drives the colour of the left border: which GTD note the task is in.
        if (task.gtd !== undefined) el.dataset.gtd = task.gtd;

        this.rowTasks.set(el, task);
        this.wireLongPress(el, task);

        const body = el.createDiv({ cls: 'ronald-task-body' });

        // A subtask starts with an arrow hooking in from the task above it.
        // Top-level tasks, the common case, carry no mark at all.
        if (task.depth > 1) {
            const nest = body.createSpan({
                cls: 'ronald-task-nest',
                attr: { 'aria-label': `Subtask, level ${task.depth}` },
            });
            setIcon(nest, 'corner-down-right');
        }

        // Wikilinks keep their place in the sentence and are styled as links.
        const line = body.createDiv({ cls: 'ronald-task-text' });
        for (const part of textParts(task.text)) {
            if (part.link) line.createSpan({ cls: 'ronald-task-inline-link', text: part.text });
            else line.appendText(part.text);
        }

        // On the same line, after the text (see `.ronald-task-body`). Links are
        // left out: they are already styled inline in the text. Nothing but
        // tags shows here, so they go without their "#".
        if (task.tags.length > 0) {
            const meta = body.createDiv({ cls: 'ronald-task-meta' });

            for (const tag of task.tags) {
                meta.createSpan({ cls: 'ronald-task-tag', text: tag });
            }
        }
    }

    /**
     * Toggle the task when its row is held down on a touch screen.
     *
     * A finger that moves more than a few pixels is scrolling, and lifting
     * early is an ordinary tap that opens the note, so both cancel the timer.
     * The tap that follows a long press is swallowed in the capture phase,
     * before Obsidian's own click handler on the result list can choose the
     * row and close the modal. Not every browser sends that click, so the flag
     * is also cleared on the next touch rather than left to eat a real tap.
     *
     * The mouse is left out: on a desktop Mod+L does the same, and holding the
     * button down is how text gets selected.
     */
    private wireLongPress(el: HTMLElement, task: TaskItem): void {
        let timer: number | undefined;
        let startX = 0;
        let startY = 0;
        let swallowClick = false;

        const cancel = () => {
            window.clearTimeout(timer);
            timer = undefined;
        };

        el.addEventListener('pointerdown', (event) => {
            swallowClick = false;
            if (event.pointerType === 'mouse') return;
            startX = event.clientX;
            startY = event.clientY;
            cancel();
            timer = window.setTimeout(() => {
                timer = undefined;
                swallowClick = true;
                void this.toggleTask(task, el);
            }, LONG_PRESS_MS);
        });
        el.addEventListener('pointermove', (event) => {
            if (timer === undefined) return;
            const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
            if (moved > LONG_PRESS_SLOP) cancel();
        });
        el.addEventListener('pointerup', cancel);
        el.addEventListener('pointercancel', cancel);

        // Android answers a long press with a context menu of its own.
        el.addEventListener('contextmenu', (event) => {
            if (swallowClick || timer !== undefined) event.preventDefault();
        });
        el.addEventListener(
            'click',
            (event) => {
                if (!swallowClick) return;
                swallowClick = false;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /**
     * Tick `task` off, or back on, in its source note, without leaving the modal.
     *
     * The row is updated straight away and rolled back if the write fails,
     * since waiting for the vault would leave it visibly unresponsive. While
     * a write is in flight further toggles of the same task are ignored, so a
     * repeated key press cannot race it.
     */
    private async toggleTask(task: TaskItem, el: HTMLElement): Promise<void> {
        if (this.pending.has(task)) return;
        this.pending.add(task);

        const desired = !task.done;
        const marker = desired ? 'x' : ' ';
        el.toggleClass('is-done', desired);

        let ok = false;
        try {
            ok = await writeTaskMarker(this.app, task, marker);
        } finally {
            this.pending.delete(task);
        }

        if (ok) {
            // Keep the in-memory task in sync so a second toggle still finds
            // its line, and so a re-render shows the new state.
            task.raw = setTaskMarker(task.raw, marker);
            task.done = desired;
        } else {
            el.toggleClass('is-done', !desired);
            new Notice(`Could not update task in "${task.file.basename}": the note changed.`);
        }
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
