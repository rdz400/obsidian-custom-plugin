import { App, HeadingCache, Notice, SuggestModal, TFile, setIcon } from 'obsidian';

import { openFileFromSearch, registerNewTabEnter } from '../ui/openfile';

/** How deep a heading may sit before it stops being indented any further. */
const MAX_INDENT_LEVEL = 6;

/** A heading in the open note plus where it sits. */
export interface OutlineItem {
    /** The heading text, without its leading `#`s. */
    heading: string;
    /** The heading level, 1 for `#` through 6 for `######`. */
    level: number;
    /** The line the heading is on, for jumping to it. */
    line: number;
}

/**
 * The headings of `file`, in the order they appear in the note.
 *
 * They come from the metadata cache rather than the note's text, so a `#` inside
 * a code block or a YAML comment is never mistaken for a heading — Obsidian has
 * already worked out which ones are real.
 */
export function collectOutline(app: App, file: TFile): OutlineItem[] {
    const headings: HeadingCache[] = app.metadataCache.getFileCache(file)?.headings ?? [];

    return headings.map((heading) => ({
        heading: heading.heading,
        level: heading.level,
        line: heading.position.start.line,
    }));
}

/**
 * Search the headings of the open note. Typing narrows the list, Enter jumps to
 * the heading in the active tab and Mod+Enter opens the note in a new tab at
 * that heading.
 *
 * The list keeps the note's own order rather than sorting by match quality, so
 * it reads as the outline it is: the rows above and below a match are the
 * headings that surround it in the note.
 */
export class OutlineModal extends SuggestModal<OutlineItem> {
    private readonly file: TFile;
    private readonly items: readonly OutlineItem[];

    constructor(app: App, file: TFile, items: readonly OutlineItem[]) {
        super(app);
        this.file = file;
        this.items = items;
        this.setPlaceholder('Search headings…');
        // Borrows the backlink search's row styling; see `styles.css`.
        this.modalEl.addClass('ronald-backlink-search');
        this.modalEl.addClass('ronald-outline');
        registerNewTabEnter(this);
    }

    getSuggestions(query: string): OutlineItem[] {
        const q = query.toLowerCase();
        return this.items.filter((item) => item.heading.toLowerCase().includes(q));
    }

    renderSuggestion(item: OutlineItem, el: HTMLElement): void {
        el.addClass('ronald-backlink-match');
        // The level rides on the row so the stylesheet can indent it and size
        // its text; anything past `MAX_INDENT_LEVEL` would only push rows off
        // the right edge for no gain.
        el.setAttr('data-level', String(Math.min(item.level, MAX_INDENT_LEVEL)));

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), `heading-${item.level}`);
        title.createSpan({ cls: 'ronald-outline-heading', text: item.heading });
    }

    onChooseSuggestion(item: OutlineItem, event: MouseEvent | KeyboardEvent): void {
        openFileFromSearch(this.app, this.file, event, {
            eState: { line: item.line, cursor: { from: { line: item.line, ch: 0 } } },
        });
    }
}

/**
 * Show the outline of the open note in a modal. Choosing a heading jumps to it —
 * in the active tab, or in a new one with Mod+Enter.
 */
export function showOutline(app: App): void {
    const file = app.workspace.getActiveFile();
    if (!file) {
        new Notice('No note is open');
        return;
    }

    const items = collectOutline(app, file);
    if (items.length === 0) {
        new Notice(`"${file.basename}" has no headings`);
        return;
    }

    new OutlineModal(app, file, items).open();
}
