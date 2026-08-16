import { App, Notice, SuggestModal, TFile, setIcon } from 'obsidian';

import { getTemplatesFolder } from './commands';
import { FilterBar, FilterChip } from './filterbar';
import { NoteTypeSetting, noteType, renderTypePill } from './notetype';
import { openFileFromSearch, registerNewTabEnter } from './openfile';

/** The note type daily notes carry; they are left out of the list. */
const DAILY_NOTE_TYPE = 'dagnotitie';

/**
 * The chip value standing for "in none of the configured folders".
 *
 * Spelled with a trailing slash so no real folder can collide with it: a folder
 * path never ends in one, since `renderFolderRow` strips trailing slashes and
 * Obsidian's own paths carry none.
 */
export const OTHER_FOLDER_FILTER = 'overige/';

/**
 * Chips for the configured folders, with "overige" last as the catch-all.
 *
 * A row left blank in the settings is dropped: it would offer a chip matching
 * everything (every path starts with '') and eat one of the nine shortcut
 * digits.
 */
export function folderFilters(folders: readonly string[]): FilterChip[] {
    const chips: FilterChip[] = folders
        .map((folder) => folder.trim().replace(/\/+$/, ''))
        .filter((folder) => folder !== '')
        .map((folder) => ({ value: folder, type: 'folder', label: folder }));

    return [...chips, { value: OTHER_FOLDER_FILTER, type: 'other-folder', label: 'overige' }];
}

/**
 * True when `file` sits in `folder` or anywhere beneath it.
 *
 * Subfolders count: notes in this vault nest ("1-projecten/archief/2026"), so a
 * chip for "1-projecten" that matched only its immediate children would miss
 * most of what lives under it. The boundary is checked with a trailing slash so
 * "1-projecten" never claims a sibling folder like "1-projecten-ref".
 */
export function fileInFolder(file: TFile, folder: string): boolean {
    const path = file.parent?.path ?? '';
    return path === folder || path.startsWith(`${folder}/`);
}

/**
 * The chip a note answers to: the first configured folder containing it, and
 * "overige" when none does.
 *
 * The first match wins rather than the longest, so nesting one configured folder
 * inside another gives the note to whichever chip is listed first — the order in
 * the settings decides, which is a thing the user can see and change.
 */
export function folderFilterValue(file: TFile, folders: readonly string[]): string {
    return folders.find((folder) => fileInFolder(file, folder)) ?? OTHER_FOLDER_FILTER;
}

/**
 * True when `file` is in one of `wanted`, or nothing is wanted at all.
 *
 * A note sits in exactly one place, so the chips are OR'd rather than AND'd:
 * turning on two folders shows notes from either, where an AND could only ever
 * match nothing.
 */
export function matchesFolder(
    file: TFile,
    wanted: ReadonlySet<string>,
    folders: readonly string[],
): boolean {
    return wanted.size === 0 || wanted.has(folderFilterValue(file, folders));
}

/** How many notes the list shows at most. */
export const RECENT_NOTES_LIMIT = 80;

/** A recently created note plus what is shown for it. */
export interface RecentNoteItem {
    file: TFile;
    /** The `datum` frontmatter value, as written in the note. */
    datum: string;
    /**
     * `datum` as a sortable number, `YYYYMMDD`. Kept alongside the raw value so
     * sorting never depends on how the date happens to be spelled.
     */
    sortKey: number;
    /** Frontmatter `type`, shown as a pill; '' when the note has none. */
    type: string;
}

/**
 * The `datum` frontmatter of a note, as the text it was written with.
 *
 * Obsidian parses a bare `YYYY-MM-DD` into a string, but a note whose frontmatter
 * carries a quoted date, a number (`20251230`), or an unfilled template
 * placeholder reaches us as something else — so anything that is not already a
 * string is stringified and left to `parseDatum` to judge.
 */
function rawDatum(app: App, file: TFile): string {
    const datum: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.datum;
    if (typeof datum === 'string') return datum.trim();
    if (typeof datum === 'number') return String(datum);
    return '';
}

/**
 * `datum` as a `YYYYMMDD` number, or undefined when it is not a date.
 *
 * Both spellings found in the vault are accepted: `2024-02-03` and the bare
 * `20251230`. Anything else — an unfilled `{{date}}` placeholder from a
 * template, a stray word — yields undefined and the note is left out, since a
 * list ordered by date has nowhere to put a note without one.
 */
export function parseDatum(datum: string): number | undefined {
    const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(datum);
    if (!match) return undefined;

    const [, year, month, day] = match;
    // Guards against a valid-looking string that is not a valid date, such as
    // month 00 or 13, which the pattern alone would let through.
    if (Number(month) < 1 || Number(month) > 12) return undefined;
    if (Number(day) < 1 || Number(day) > 31) return undefined;

    return Number(`${year}${month}${day}`);
}

/** `datum` as `DD-MM-YYYY`, the way dates read in this vault. */
export function formatDatum(sortKey: number): string {
    const text = String(sortKey);
    return `${text.slice(6, 8)}-${text.slice(4, 6)}-${text.slice(0, 4)}`;
}

/**
 * The most recently created notes, newest first, at most `limit` of them.
 *
 * "Created" is what the note's own `datum` frontmatter says rather than the
 * file's mtime: a note moved or edited later keeps the date it was written for,
 * which is the date this list is about. Notes without a usable `datum` are left
 * out — see `parseDatum`.
 *
 * Daily notes are excluded: there is one for every day, so they would crowd out
 * everything else the list exists to surface. Templates are excluded too, the
 * same way the project search excludes them, since a template's `datum` is an
 * unfilled placeholder rather than a date.
 */
export function collectRecentNotes(app: App, limit = RECENT_NOTES_LIMIT): RecentNoteItem[] {
    const templatesFolder = getTemplatesFolder(app);
    const isTemplate = (file: TFile): boolean =>
        templatesFolder !== null &&
        (file.path === templatesFolder || file.path.startsWith(`${templatesFolder}/`));

    const items: RecentNoteItem[] = [];

    for (const file of app.vault.getMarkdownFiles()) {
        if (isTemplate(file)) continue;

        const type = noteType(app, file);
        if (type === DAILY_NOTE_TYPE) continue;

        const datum = rawDatum(app, file);
        const sortKey = parseDatum(datum);
        if (sortKey === undefined) continue;

        items.push({ file, datum, sortKey, type });
    }

    // Newest first, and same-day notes by name so a day's worth of notes keeps a
    // stable order from one open to the next rather than the vault's file order.
    items.sort(
        (a, b) => b.sortKey - a.sortKey || a.file.basename.localeCompare(b.file.basename),
    );

    return items.slice(0, limit);
}

/**
 * Search the recently created notes by name, showing each note's creation date,
 * its folder and its type. Choosing one opens it; Mod+Enter opens it in a new
 * tab.
 *
 * The list is already cut to the most recent notes before it reaches the modal,
 * so the query narrows what is on screen rather than reaching back into older
 * notes — this is a "what did I write lately" list, not a vault-wide search.
 */
export class RecentNotesModal extends SuggestModal<RecentNoteItem> {
    private readonly items: readonly RecentNoteItem[];
    private readonly noteTypes: readonly NoteTypeSetting[];
    /** The folders with a chip of their own; the rest answer to "overige". */
    private readonly folders: readonly string[];
    private readonly folderChips: FilterChip[];
    private readonly folderFilters: FilterBar;

    constructor(
        app: App,
        items: readonly RecentNoteItem[],
        noteTypes: readonly NoteTypeSetting[],
        folders: readonly string[] = [],
    ) {
        super(app);
        this.items = items;
        this.noteTypes = noteTypes;
        this.folderChips = folderFilters(folders);
        // The configured folders in chip order, so `folderFilterValue` resolves
        // a note against exactly the chips that are on screen.
        this.folders = this.folderChips
            .map(({ value }) => value)
            .filter((value) => value !== OTHER_FOLDER_FILTER);
        this.setPlaceholder('Search recently created notes…');
        // Borrows the backlink search's row styling; see `styles.css`.
        this.modalEl.addClass('ronald-backlink-search');
        this.modalEl.addClass('ronald-recent-notes');
        registerNewTabEnter(this);

        this.folderFilters = new FilterBar({
            chips: this.folderChips,
            onChange: () => this.rerunSearch(),
        });
        this.mountFilters();

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bar is on screen before that, so seed it here.
        this.folderFilters.setCounts(this.folderCounts(''));
    }

    /**
     * Place the folder chips and give them their keyboard shortcuts.
     *
     * The bar sits between the search field and the results, so it stays visible
     * while typing rather than scrolling away with the matches.
     *
     * Shortcuts are listened for on the modal rather than the input so they work
     * wherever focus sits, in the capture phase so Obsidian's own Mod+digit
     * bindings never see a press meant for a chip.
     */
    private mountFilters(): void {
        this.inputEl.parentElement?.insertAdjacentElement(
            'afterend',
            this.folderFilters.el,
        );

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!this.folderFilters.handleKeyDown(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /**
     * Re-run the current query so the results reflect a changed folder filter.
     *
     * `onInput` is what Obsidian's own input listener calls; it replaces the
     * result list in place. Dispatching an `input` event instead appends a
     * second set of results on top of the old ones, so it is not an option.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    /** True when the query appears in the note's path. */
    private matchesQuery(item: RecentNoteItem, q: string): boolean {
        // The folder is matched too, so a query can narrow to one part of the
        // vault, as in the backlink search.
        return item.file.path.toLowerCase().includes(q);
    }

    getSuggestions(query: string): RecentNoteItem[] {
        const q = query.toLowerCase();
        const matches = this.items.filter(
            (item) =>
                matchesFolder(item.file, this.folderFilters.activeValues, this.folders) &&
                this.matchesQuery(item, q),
        );

        this.folderFilters.setCounts(this.folderCounts(q));
        return matches;
    }

    /**
     * How many notes each folder chip stands for, given the query.
     *
     * The chips are OR'd together (see `matchesFolder`), so turning one on only
     * ever adds its own matches regardless of which others are active — the
     * count for a chip is how many notes answer to it and match the query.
     */
    private folderCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();

        for (const { value } of this.folderChips) {
            counts.set(
                value,
                this.items.filter(
                    (item) =>
                        folderFilterValue(item.file, this.folders) === value &&
                        this.matchesQuery(item, q),
                ).length,
            );
        }

        return counts;
    }

    renderSuggestion(item: RecentNoteItem, el: HTMLElement): void {
        el.addClass('ronald-backlink-match');

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), 'file-text');
        title.createSpan({ cls: 'ronald-recent-name', text: item.file.basename });

        // Before the type pill, so the pill keeps the right edge of the row to
        // itself and lines up from row to row, as in the backlink search.
        const date = title.createSpan({ cls: 'ronald-recent-date' });
        date.setAttr('aria-label', `Created ${formatDatum(item.sortKey)}`);
        setIcon(date.createSpan(), 'calendar');
        date.createSpan({ text: formatDatum(item.sortKey) });

        renderTypePill(title, item.type, this.noteTypes);

        // Only when the note sits somewhere: a note in the vault root has no
        // parent path worth a second line.
        const folder = item.file.parent?.path ?? '';
        if (folder && folder !== '/') {
            el.createDiv({ cls: 'ronald-backlink-path', text: folder });
        }
    }

    onChooseSuggestion(item: RecentNoteItem, event: MouseEvent | KeyboardEvent): void {
        openFileFromSearch(this.app, item.file, event);
    }
}

/**
 * Show the most recently created notes in a modal, newest first. Choosing one
 * opens it — in the active tab, or in a new one with Mod+Enter — and the folder
 * chips, reachable as Mod+1…Mod+9, narrow the list to one part of the vault.
 *
 * `noteTypes` and `folders` come from the settings: the first decides which
 * types get an icon on their pill, the second which folders get a chip.
 */
export function showRecentNotes(
    app: App,
    noteTypes: readonly NoteTypeSetting[],
    folders: readonly string[] = [],
): void {
    const items = collectRecentNotes(app);

    if (items.length === 0) {
        new Notice('No notes with a "datum" found');
        return;
    }

    new RecentNotesModal(app, items, noteTypes, folders).open();
}
