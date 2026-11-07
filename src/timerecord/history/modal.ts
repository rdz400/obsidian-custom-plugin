import { App, SuggestModal, setIcon } from 'obsidian';

import { FilterBar } from '../../shared/ui/filterbar';
import { openFileFromSearch, registerNewTabEnter } from '../../shared/ui/openfile';
import { heatClasses } from '../heatmap/heatmap';
import type { NoteEntry } from './collect';
import { formatDuration } from './durations';
import { readableText } from './entries';
import { placementLabel } from './placedays';
import { firstOfEachDay, recordSearch } from './search';
import { matchesWeekdays, WEEKDAY_CHIPS } from './weekdayfilter';

/**
 * How many records the list shows. The latest come first and typing narrows the
 * list, so what falls off the end is what a search would have to name anyway.
 */
const MAX_RESULTS = 300;

/**
 * Search the time record history. Typing narrows the list, and so do the weekday
 * chips or Mod+1 (Monday) to Mod+7 (Sunday). Enter opens the note at the record,
 * Mod+Enter does so in a new tab.
 */
export class TimeHistoryModal extends SuggestModal<NoteEntry> {
    private readonly search: (query: string) => NoteEntry[];
    private readonly weekdays: FilterBar;
    /** The records in the current list that get their day's heading above them. */
    private dayOpeners: ReadonlySet<NoteEntry> = new Set();

    constructor(app: App, entries: readonly NoteEntry[]) {
        super(app);
        this.search = recordSearch(entries);
        this.limit = MAX_RESULTS;
        this.emptyStateText = 'No matching time records';
        this.setPlaceholder('Search by text, weekday or date…');
        this.modalEl.addClass('ronald-time-history');
        registerNewTabEnter(this);

        this.weekdays = new FilterBar({
            chips: WEEKDAY_CHIPS,
            onChange: () => this.rerunSearch(),
        });
        this.mountWeekdays();
    }

    /**
     * Place the chips below the search field and listen for their shortcuts: on
     * the modal so they work wherever focus sits, in the capture phase so
     * Obsidian's own Mod+digit bindings never see a press meant for a chip.
     */
    private mountWeekdays(): void {
        this.inputEl.parentElement?.insertAdjacentElement('afterend', this.weekdays.el);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!this.weekdays.handleKeyDown(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /**
     * Re-run the current query so the list reflects a changed filter. `onInput`
     * is what Obsidian's own input listener calls; dispatching an `input` event
     * instead adds a second set of results to the list.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    getSuggestions(query: string): NoteEntry[] {
        const results = this.search(query)
            .filter((entry) => matchesWeekdays(entry, this.weekdays.activeValues))
            .slice(0, MAX_RESULTS);
        this.dayOpeners = firstOfEachDay(results);
        return results;
    }

    renderSuggestion(entry: NoteEntry, el: HTMLElement): void {
        if (this.dayOpeners.has(entry)) renderDayHeading(entry, el);

        el.addClass('ronald-time-history-record');
        const { time, start, text } = entry.record;
        el.createEl('code', { cls: heatClasses(Math.floor(start / 3600)), text: time });
        el.createSpan({ cls: 'ronald-time-history-text', text: readableText(text) });
        renderDurations(entry, el);
    }

    onChooseSuggestion(entry: NoteEntry, event: MouseEvent | KeyboardEvent): void {
        const { line } = entry.record;
        openFileFromSearch(this.app, entry.note, event, {
            eState: { line, cursor: { from: { line, ch: 0 } } },
        });
    }
}

/**
 * Head a day's records with its date. It goes in front of the row rather than
 * in it, so it isn't part of what gets selected: the chooser only tracks the
 * rows it made and leaves other children of the list alone.
 */
function renderDayHeading(entry: NoteEntry, row: HTMLElement): void {
    const heading = createDiv({
        cls: 'ronald-time-history-day',
        text: placementLabel(entry.day.placement),
    });
    row.insertAdjacentElement('beforebegin', heading);
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
