import { App, Loc, Notice, Reference, SuggestModal, TFile, setIcon } from 'obsidian';

import { openFileFromSearch, registerNewTabEnter } from './openfile';

/** A note linking to the target note, plus what is shown for it. */
export interface BacklinkItem {
    file: TFile;
    /** How many links in this note point at the target. */
    count: number;
    /** Frontmatter `type` of the linking note, shown as a pill; '' when absent. */
    type: string;
    /**
     * Line of the first link to the target in the body, so choosing the note
     * can jump to it. Absent when every link is in the frontmatter, which
     * carries no position — those notes are simply opened at the top.
     */
    line?: number;
}

/** Lucide icon per note type; used for the type pill. */
const TYPE_ICONS: Record<string, string> = {
    project: 'folder',
    taken: 'list-checks',
};

/**
 * True when `link` resolves to `target` when written in `sourcePath`.
 *
 * The stored link text is whatever the author typed — a bare name, a relative
 * path, one with an extension, one with a "#heading" or "|display" tail — so it
 * is put back through the same resolver Obsidian uses and the resulting file is
 * compared. That keeps two same-named notes in different folders apart, which
 * matching on text alone would not.
 */
function linkResolvesTo(
    app: App,
    link: Reference,
    sourcePath: string,
    target: TFile,
): boolean {
    const path = link.link.split('#')[0]?.split('|')[0]?.trim() ?? '';
    if (path === '') return false;
    return app.metadataCache.getFirstLinkpathDest(path, sourcePath) === target;
}

/**
 * Every note that links to `target`, most links first.
 *
 * The per-file cache is read rather than `resolvedLinks`, because the latter
 * holds only counts: to jump to a link we need where it sits, which `links`
 * carries as a `Pos` per reference. Embeds count as links, matching what
 * `resolvedLinks` counts and what Obsidian's own backlinks pane shows.
 *
 * Frontmatter links are counted too but have no position, so a note that links
 * only from its frontmatter gets no jump target and opens at the top — which is
 * the sensible destination there anyway.
 */
export function collectBacklinks(app: App, target: TFile): BacklinkItem[] {
    const items: BacklinkItem[] = [];

    for (const file of app.vault.getMarkdownFiles()) {
        if (file.path === target.path) continue;

        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;

        const body = [...(cache.links ?? []), ...(cache.embeds ?? [])].filter((link) =>
            linkResolvesTo(app, link, file.path, target),
        );
        const frontmatter = (cache.frontmatterLinks ?? []).filter((link) =>
            linkResolvesTo(app, link, file.path, target),
        );

        const count = body.length + frontmatter.length;
        if (count === 0) continue;

        // The earliest body link, so Enter lands on the first mention rather
        // than whichever reference the cache happens to list first.
        const first = body.reduce<Loc | undefined>(
            (best, link) =>
                best === undefined || link.position.start.offset < best.offset
                    ? link.position.start
                    : best,
            undefined,
        );

        const type: unknown = cache.frontmatter?.type;
        items.push({
            file,
            count,
            type: typeof type === 'string' ? type : '',
            line: first?.line,
        });
    }

    return items.sort(
        (a, b) => b.count - a.count || a.file.basename.localeCompare(b.file.basename),
    );
}

/**
 * Open the note at the line its first link to the target sits on, the same way
 * the task search jumps to a task's line.
 *
 * A note whose only links are in the frontmatter has no line to go to and is
 * opened at the top. Selecting the link text itself is deliberately not
 * attempted: `eState` moves the cursor but does not hold a selection through
 * the modal closing, and the line is enough to find the mention by eye.
 */
function openBacklink(
    app: App,
    item: BacklinkItem,
    event?: MouseEvent | KeyboardEvent,
): void {
    const line = item.line;
    if (line === undefined) {
        openFileFromSearch(app, item.file, event);
        return;
    }

    openFileFromSearch(app, item.file, event, {
        eState: { line, cursor: { from: { line, ch: 0 } } },
    });
}

/**
 * Search the notes linking to one note by name, showing each note's type and
 * how many links it carries. Choosing one opens it at the line of its first
 * link to the target; Mod+Enter does the same in a new tab.
 */
export class BacklinkSearchModal extends SuggestModal<BacklinkItem> {
    private items: BacklinkItem[];

    constructor(app: App, target: TFile, items: BacklinkItem[]) {
        super(app);
        this.items = items;
        this.setPlaceholder(`Search notes linking to ${target.basename}…`);
        this.modalEl.addClass('ronald-backlink-search');
        registerNewTabEnter(this);
    }

    getSuggestions(query: string): BacklinkItem[] {
        const q = query.toLowerCase();
        // The folder is matched too, so a query can narrow to one part of the
        // vault when several notes share a name-ish prefix.
        return this.items.filter((item) => item.file.path.toLowerCase().includes(q));
    }

    renderSuggestion(item: BacklinkItem, el: HTMLElement): void {
        el.addClass('ronald-backlink-match');

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), 'file-text');
        title.createSpan({ text: item.file.basename });

        // Only when the note sits somewhere: a note in the vault root has no
        // parent path worth a second line.
        const folder = item.file.parent?.path ?? '';
        if (folder && folder !== '/') {
            el.createDiv({ cls: 'ronald-backlink-path', text: folder });
        }

        // Before the type pill, so the pill keeps the right edge of the row to
        // itself and lines up from row to row, as in the project search.
        //
        // A single link is left blank: linking once is the ordinary case and
        // needs no number, so the count is reserved for the notes that stand
        // out by linking repeatedly. The slot is created either way and holds
        // its width, so the type pills stay aligned down the list.
        const links = title.createSpan({ cls: 'ronald-backlink-count' });
        if (item.count > 1) {
            links.setAttr('aria-label', `${item.count} links to this note`);
            setIcon(links.createSpan(), 'link');
            links.createSpan({ text: String(item.count) });
        }

        if (item.type) {
            const type = title.createSpan({
                cls: `ronald-backlink-type ronald-backlink-type-${item.type}`,
            });
            const icon = TYPE_ICONS[item.type];
            if (icon) setIcon(type.createSpan(), icon);
            type.createSpan({ text: item.type });
        }
    }

    onChooseSuggestion(item: BacklinkItem, event: MouseEvent | KeyboardEvent): void {
        openBacklink(this.app, item, event);
    }
}

/**
 * Search the notes linking to the active note in a modal. Choosing one opens it
 * — in the active tab, or in a new one with Mod+Enter — at the first link to
 * the note, or at the top when that link is in the frontmatter.
 */
export function searchBacklinks(app: App): void {
    const target = app.workspace.getActiveFile();
    if (!target) {
        new Notice('No note is open');
        return;
    }

    const items = collectBacklinks(app, target);
    if (items.length === 0) {
        new Notice(`No notes link to "${target.basename}"`);
        return;
    }

    new BacklinkSearchModal(app, target, items).open();
}
