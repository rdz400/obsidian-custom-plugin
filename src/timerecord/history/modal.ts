import { App, type OpenViewState, SuggestModal, setIcon } from 'obsidian';

import { FilterBar, type FilterChip } from '../../shared/ui/filterbar';
import {
    openFileFromSearch,
    registerAltEnter,
    registerNewTabEnter,
    wantsAltAction,
} from '../../shared/ui/openfile';
import { heatClasses } from '../heatmap/heatmap';
import type { NoteEntry } from './collect';
import { DAYPART_CHIPS, matchesDayparts } from './daypartfilter';
import { formatDuration } from './durations';
import { readableText, textParts, totalSeconds } from './entries';
import { placementLabel } from './placedays';
import { firstOfEachDay, recordSearch } from './search';
import { matchesTags, tagChips } from './tagfilter';
import { matchesWeekdays, WEEKDAY_CHIPS } from './weekdayfilter';

/**
 * How many records the list shows. The latest come first and typing narrows the
 * list, so what falls off the end is what a search would have to name anyway.
 */
const MAX_RESULTS = 300;

/** What the search opens with, for a link that asks for a particular view. */
export interface TimeHistoryPreset {
    /** Text to put in the search field. */
    query?: string;
    /** Values of the weekday chips to switch on. */
    weekdays?: readonly string[];
}

/** The values of `chips` that are on in `active`, for a row that holds several kinds. */
function chosen(chips: readonly FilterChip[], active: ReadonlySet<string>): Set<string> {
    return new Set(chips.map((chip) => chip.value).filter((value) => active.has(value)));
}

/**
 * Search the time record history. Typing narrows the list, and so do the chips:
 * weekdays on Mod+1 (Monday) to Mod+7 (Sunday) and the time of day on Mod+8
 * (before noon) and Mod+9 (after), in one row, and the tags from settings on
 * Alt+1…9 below it. Once anything narrows the list, the total time of what it
 * found shows at the end of the chips. Enter opens the note at the record,
 * Mod+Enter does so in a new tab, and Alt+Enter or Alt+click in a new tab behind
 * the search, which stays open for the next one.
 */
export class TimeHistoryModal extends SuggestModal<NoteEntry> {
    private readonly search: (query: string) => NoteEntry[];
    /** Weekdays and the time of day: one row, so they share Mod+1…9. */
    private readonly dayBar: FilterBar;
    /** The tags from settings, or null when there are none. */
    private readonly tagBar: FilterBar | null;
    private readonly totalEl: HTMLElement;
    private readonly initialQuery: string;
    /** The records in the current list that get their day's heading above them. */
    private dayOpeners: ReadonlySet<NoteEntry> = new Set();

    constructor(
        app: App,
        entries: readonly NoteEntry[],
        tags: readonly string[],
        preset: TimeHistoryPreset = {},
    ) {
        super(app);
        this.search = recordSearch(entries);
        this.limit = MAX_RESULTS;
        this.emptyStateText = 'No matching time records';
        this.setPlaceholder('Search by text, weekday or date…');
        this.modalEl.addClass('ronald-time-history');
        registerNewTabEnter(this);
        registerAltEnter(this);

        this.dayBar = new FilterBar({
            chips: [...WEEKDAY_CHIPS, ...DAYPART_CHIPS],
            onChange: () => this.rerunSearch(),
        });
        this.tagBar =
            tags.length > 0
                ? new FilterBar({
                      chips: tagChips(tags),
                      onChange: () => this.rerunSearch(),
                      // Its own modifier, so both rows can number their chips from 1.
                      modifier: 'alt',
                  })
                : null;
        this.totalEl = createSpan({ cls: 'ronald-time-history-total' });
        this.totalEl.hide();
        this.mountFilters();

        // Toggled before the modal is on screen, so the first list is already narrowed.
        for (const weekday of preset.weekdays ?? []) {
            this.dayBar.toggle(weekday);
        }
        this.initialQuery = preset.query ?? '';
    }

    /**
     * Seed the search field once the modal is up. It has to wait for `super.onOpen`:
     * Obsidian renders the list for an empty field then, and the query's own list
     * has to replace that one.
     */
    onOpen(): void {
        void super.onOpen();
        if (this.initialQuery.length === 0) return;

        this.inputEl.value = this.initialQuery;
        this.rerunSearch();
    }

    /**
     * Place the chip rows below the search field, the total at the end of the
     * last one where it takes no line of its own, and listen for the shortcuts:
     * on the modal so they work wherever focus sits, in the capture phase so
     * Obsidian's own Mod+digit bindings never see a press meant for a chip.
     */
    private mountFilters(): void {
        const bars = this.tagBar ? [this.dayBar, this.tagBar] : [this.dayBar];
        this.inputEl.parentElement?.after(...bars.map((bar) => bar.el));
        // The bar only toggles its own chips, so an element added after them is left alone.
        bars[bars.length - 1]!.el.appendChild(this.totalEl);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!bars.some((bar) => bar.handleKeyDown(event))) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /**
     * Re-run the current query so the list reflects a changed filter. `onInput`
     * is what Obsidian's own input listener calls; it isn't in the API's types,
     * hence the cast.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    getSuggestions(query: string): NoteEntry[] {
        const active = this.dayBar.activeValues;
        const weekdays = chosen(WEEKDAY_CHIPS, active);
        const dayparts = chosen(DAYPART_CHIPS, active);
        const tags = this.tagBar?.activeValues ?? new Set<string>();

        const matches = this.search(query).filter(
            (entry) =>
                matchesWeekdays(entry, weekdays) &&
                matchesDayparts(entry, dayparts) &&
                matchesTags(entry, tags),
        );
        this.showTotal(matches, query.trim().length > 0 || active.size > 0 || tags.size > 0);

        const results = matches.slice(0, MAX_RESULTS);
        this.dayOpeners = firstOfEachDay(results);
        return results;
    }

    /**
     * The time recorded in everything the search found, also past the rows the
     * list shows. Only once something narrows the list: over the whole history
     * it says little.
     */
    private showTotal(matches: readonly NoteEntry[], narrowed: boolean): void {
        this.totalEl.toggle(narrowed);
        if (!narrowed) return;

        const records = matches.length === 1 ? '1 record' : `${matches.length} records`;
        this.totalEl.setText(`${formatDuration(totalSeconds(matches))} · ${records}`);
        this.totalEl.setAttribute('aria-label', 'Total time recorded in the records found');
    }

    renderSuggestion(entry: NoteEntry, el: HTMLElement): void {
        if (this.dayOpeners.has(entry)) renderDayHeading(entry, el);

        el.addClass('ronald-time-history-record');
        const { time, start, text } = entry.record;
        el.createEl('code', { cls: heatClasses(Math.floor(start / 3600)), text: time });
        renderText(readableText(text), el);
        if (entry.outOfOrder) renderOutOfOrder(el, 'Earlier than the record above it in the note');
        else renderDurations(entry, el);
    }

    /**
     * With Alt, open the record behind the search instead of choosing it. This is
     * where Enter and a click arrive, and the base class closes the modal here
     * before calling `onChooseSuggestion`, so skipping it is what keeps it open.
     */
    selectSuggestion(entry: NoteEntry, event: MouseEvent | KeyboardEvent): void {
        if (!wantsAltAction(event)) {
            super.selectSuggestion(entry, event);
            return;
        }
        // `active: false` leaves the new tab in the background and focus in the search.
        void this.app.workspace.getLeaf('tab').openFile(entry.note, {
            ...recordState(entry),
            active: false,
        });
    }

    onChooseSuggestion(entry: NoteEntry, event: MouseEvent | KeyboardEvent): void {
        openFileFromSearch(this.app, entry.note, event, recordState(entry));
    }
}

/** What opens a note with the cursor at the start of the record's line. */
function recordState({ record: { line } }: NoteEntry): OpenViewState {
    return { eState: { line, cursor: { from: { line, ch: 0 } } } };
}

/**
 * Head a day's records with its date. It goes in front of the row rather than
 * in it, so it isn't part of what gets selected: the chooser only tracks the
 * rows it made and leaves other children of the list alone.
 */
function renderDayHeading(entry: NoteEntry, row: HTMLElement): void {
    const heading = createDiv({ cls: 'ronald-time-history-day' });
    heading.createSpan({ text: placementLabel(entry.day.placement) });
    if (entry.day.outOfOrder) renderOutOfOrder(heading, 'Not later than the date above it in the note');
    row.insertAdjacentElement('beforebegin', heading);
}

/** A record's text, with its tags shown as tags. */
function renderText(text: string, row: HTMLElement): void {
    const el = row.createSpan({ cls: 'ronald-time-history-text' });
    for (const part of textParts(text)) {
        if (part.tag) el.createSpan({ cls: 'ronald-time-history-tag', text: part.text });
        else el.appendText(part.text);
    }
}

/** The mark on a row or heading that breaks the note's order, where its durations would go. */
function renderOutOfOrder(parent: HTMLElement, why: string): void {
    const mark = parent.createSpan({
        cls: 'ronald-time-history-out-of-order',
        attr: { 'aria-label': `Out of order: ${why}` },
    });
    setIcon(mark, 'alert-triangle');
}

/** The two durations a record can show, at the row's right edge. */
function renderDurations({ took, untilNext }: NoteEntry, row: HTMLElement): void {
    if (took === null && untilNext === null) return;

    const durations = row.createSpan({ cls: 'ronald-time-history-durations' });
    if (took !== null) {
        renderDuration(durations, 'timer', took, 'Took', 'ronald-time-history-took');
    }
    if (untilNext !== null) {
        // Up, because the list runs from the latest back: the next record is above.
        renderDuration(durations, 'arrow-up', untilNext, 'Next record after', 'ronald-time-history-gap');
    }
}

function renderDuration(
    parent: HTMLElement,
    icon: string,
    seconds: number,
    label: string,
    cls: string,
): void {
    const text = formatDuration(seconds);
    const duration = parent.createSpan({ cls, attr: { 'aria-label': `${label} ${text}` } });
    setIcon(duration.createSpan(), icon);
    duration.createSpan({ text });
}
