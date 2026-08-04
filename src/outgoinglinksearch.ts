import {
    App,
    CachedMetadata,
    Notice,
    Reference,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

import {
    openFileFromSearch,
    registerAltEnter,
    registerNewTabEnter,
    wantsAltAction,
} from './openfile';

/** One destination the current note links to, however often it links there. */
export interface OutgoingLinkItem {
    /**
     * What the link points at: the note for an internal link that resolves, the
     * URL for an external one, and the raw link text for an internal link whose
     * note does not exist (yet).
     */
    kind: 'note' | 'external' | 'unresolved';
    /** The note an internal link resolves to; absent for the other kinds. */
    file?: TFile;
    /** The URL an external link points at; absent for the other kinds. */
    url?: string;
    /** What the row is searched and sorted by: note name, URL, or link text. */
    name: string;
    /** Second line under the name: the note's folder, or the URL's host. */
    detail: string;
    /** How many times the note links to this destination. */
    count: number;
    /**
     * Line of the first link to this destination in the body, so Alt+Enter can
     * jump to it. Absent when every link sits in the frontmatter, which carries
     * no position.
     */
    line?: number;
}

/** Lucide icon per kind of destination. */
const KIND_ICONS: Record<OutgoingLinkItem['kind'], string> = {
    note: 'file-text',
    external: 'globe',
    unresolved: 'file-question',
};

/** Schemes treated as external links rather than as vault paths. */
const EXTERNAL_LINK_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** A `mailto:` or `tel:` link has no `//` but is external all the same. */
const SCHEME_ONLY_RE = /^(mailto|tel):/i;

/** True when a link's target is a URL rather than a note in the vault. */
function isExternal(link: string): boolean {
    return EXTERNAL_LINK_RE.test(link) || SCHEME_ONLY_RE.test(link);
}

/**
 * Bare URLs written straight into the text, which the metadata cache does not
 * record: only `[text](url)` and `<url>` reach `cache.links`, so an autolinked
 * `https://…` in a paragraph would otherwise be missed.
 *
 * Trailing punctuation is trimmed because a URL at the end of a sentence
 * usually swallows the period, and the closing paren of "(see https://x)" is
 * not part of the address.
 */
const BARE_URL_RE = /(?<![(<[]|\]\()\bhttps?:\/\/[^\s<>()[\]"'`]+/gi;

/** The host of a URL, or '' when it has none or does not parse. */
function urlHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

/** Strip the `#heading`/`^block` and `|display` tails from a wikilink target. */
function linkPath(link: string): string {
    return link.split('#')[0]?.split('|')[0]?.trim() ?? '';
}

/**
 * Fold the links of one note into `items`, keyed so a destination reached
 * several times becomes a single row with a count.
 *
 * Notes are keyed by path so two same-named notes in different folders stay
 * apart; URLs by the URL itself; unresolved links by their text, lowercased,
 * because `[[Tuin]]` and `[[tuin]]` would create the same note.
 */
function addLink(
    items: Map<string, OutgoingLinkItem>,
    key: string,
    make: () => OutgoingLinkItem,
    line?: number,
): void {
    const existing = items.get(key);
    if (!existing) {
        items.set(key, { ...make(), line });
        return;
    }

    existing.count++;
    // The earliest mention, so the jump lands on the first one rather than on
    // whichever reference the cache happens to list first.
    if (line !== undefined && (existing.line === undefined || line < existing.line)) {
        existing.line = line;
    }
}

/** Record one cached reference — internal or external — under its destination. */
function addReference(
    app: App,
    items: Map<string, OutgoingLinkItem>,
    link: Reference,
    sourcePath: string,
    line?: number,
): void {
    const target = link.link.trim();
    if (target === '') return;

    if (isExternal(target)) {
        addLink(
            items,
            `url:${target}`,
            () => ({
                kind: 'external',
                url: target,
                name: target,
                detail: urlHost(target),
                count: 1,
            }),
            line,
        );
        return;
    }

    const path = linkPath(target);
    if (path === '') return;

    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
    if (file) {
        const folder = file.parent?.path ?? '';
        addLink(
            items,
            `note:${file.path}`,
            () => ({
                kind: 'note',
                file,
                name: file.basename,
                detail: folder && folder !== '/' ? folder : '',
                count: 1,
            }),
            line,
        );
        return;
    }

    addLink(
        items,
        `unresolved:${path.toLowerCase()}`,
        () => ({
            kind: 'unresolved',
            name: path,
            detail: 'not created yet',
            count: 1,
        }),
        line,
    );
}

/** Sort rank per kind, so notes come before URLs and unresolved links last. */
const KIND_ORDER: OutgoingLinkItem['kind'][] = ['note', 'external', 'unresolved'];

/**
 * Every distinct destination `file` links to, notes first and then URLs.
 *
 * Wikilinks, markdown links and embeds are read from the metadata cache, which
 * carries a position per reference so a row can jump to its first mention;
 * frontmatter links are included too but have no position, so a destination
 * linked only from the frontmatter opens at the top of the note.
 *
 * Bare URLs are found by scanning `content`, since the cache does not record
 * them. Their line comes from counting newlines up to the match.
 */
export function collectOutgoingLinks(
    app: App,
    file: TFile,
    cache: CachedMetadata | null,
    content: string,
): OutgoingLinkItem[] {
    const items = new Map<string, OutgoingLinkItem>();

    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
        addReference(app, items, link, file.path, link.position.start.line);
    }

    for (const link of cache?.frontmatterLinks ?? []) {
        addReference(app, items, link, file.path);
    }

    // Frontmatter is skipped: a `source: https://…` property is a value, not a
    // link, and counting it here would list every note's own metadata.
    const bodyStart = cache?.frontmatterPosition
        ? cache.frontmatterPosition.end.offset
        : 0;

    for (const match of content.slice(bodyStart).matchAll(BARE_URL_RE)) {
        const url = match[0].replace(/[.,;:!?]+$/, '');
        const offset = bodyStart + (match.index ?? 0);
        const line = content.slice(0, offset).split('\n').length - 1;
        addLink(
            items,
            `url:${url}`,
            () => ({
                kind: 'external',
                url,
                name: url,
                detail: urlHost(url),
                count: 1,
            }),
            line,
        );
    }

    return [...items.values()].sort(
        (a, b) =>
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            a.name.localeCompare(b.name),
    );
}

/** Open an external link in the browser, or a note the usual way. */
function openDestination(
    app: App,
    item: OutgoingLinkItem,
    event?: MouseEvent | KeyboardEvent,
): void {
    if (item.kind === 'external' && item.url) {
        // Mod+Enter means nothing here: the browser decides where a URL lands.
        window.open(item.url, '_blank');
        return;
    }

    if (item.file) {
        openFileFromSearch(app, item.file, event);
        return;
    }

    // An unresolved link has no file to open; following it would create a note,
    // which a search modal should not do behind the user's back.
    new Notice(`"${item.name}" does not exist yet`);
}

/**
 * Jump to the first place in the current note where this destination is linked.
 *
 * A destination linked only from the frontmatter has no line to go to, so the
 * note is simply revealed at the top.
 */
function openMention(
    app: App,
    source: TFile,
    item: OutgoingLinkItem,
    event: MouseEvent | KeyboardEvent,
): void {
    const line = item.line;
    if (line === undefined) {
        openFileFromSearch(app, source, event);
        return;
    }

    openFileFromSearch(app, source, event, {
        eState: { line, cursor: { from: { line, ch: 0 } } },
    });
}

/**
 * Search the destinations one note links to, each listed once with how many
 * links point at it. Enter follows the link, Mod+Enter follows it in a new tab,
 * and Alt+Enter jumps to the first place in the note where it is written.
 */
export class OutgoingLinkSearchModal extends SuggestModal<OutgoingLinkItem> {
    private items: OutgoingLinkItem[];
    private onChoose: (item: OutgoingLinkItem, event: MouseEvent | KeyboardEvent) => void;

    constructor(
        app: App,
        source: TFile,
        items: OutgoingLinkItem[],
        onChoose: (item: OutgoingLinkItem, event: MouseEvent | KeyboardEvent) => void,
    ) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        this.setPlaceholder(`Search links in ${source.basename}…`);
        this.modalEl.addClass('ronald-backlink-search');
        registerNewTabEnter(this);
        registerAltEnter(this);
    }

    getSuggestions(query: string): OutgoingLinkItem[] {
        const q = query.toLowerCase();
        // The detail line is matched too, so a query can narrow to one folder
        // or to a host without having to name the note or the full URL.
        return this.items.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.detail.toLowerCase().includes(q),
        );
    }

    renderSuggestion(item: OutgoingLinkItem, el: HTMLElement): void {
        el.addClass('ronald-backlink-match');

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), KIND_ICONS[item.kind]);
        title.createSpan({ cls: 'ronald-outgoing-name', text: item.name });

        if (item.detail) {
            el.createDiv({ cls: 'ronald-backlink-path', text: item.detail });
        }

        // A single link is left blank: linking once is the ordinary case and
        // needs no number. The slot is created either way and holds its width,
        // so the counts line up down the list, as in the backlink search.
        const links = title.createSpan({ cls: 'ronald-backlink-count' });
        if (item.count > 1) {
            links.setAttr('aria-label', `linked ${item.count} times`);
            setIcon(links.createSpan(), 'link');
            links.createSpan({ text: String(item.count) });
        }
    }

    onChooseSuggestion(item: OutgoingLinkItem, event: MouseEvent | KeyboardEvent): void {
        this.onChoose(item, event);
    }
}

/**
 * Search the links going out of the active note in a modal, each destination
 * listed once. Enter opens it — a note in the active tab, an external link in
 * the browser — Mod+Enter opens a note in a new tab, and Alt+Enter jumps to the
 * first place in the note where the link is written.
 */
export async function searchOutgoingLinks(app: App): Promise<void> {
    const source = app.workspace.getActiveFile();
    if (!source) {
        new Notice('No note is open');
        return;
    }

    const cache = app.metadataCache.getFileCache(source);
    const content = await app.vault.cachedRead(source);
    const items = collectOutgoingLinks(app, source, cache, content);

    if (items.length === 0) {
        new Notice(`"${source.basename}" has no links`);
        return;
    }

    new OutgoingLinkSearchModal(app, source, items, (item, event) => {
        if (wantsAltAction(event)) {
            openMention(app, source, item, event);
            return;
        }
        // Alt is checked first, so a plain or Mod-modified press lands here and
        // `openFileFromSearch` decides which tab the note goes in.
        openDestination(app, item, event);
    }).open();
}
