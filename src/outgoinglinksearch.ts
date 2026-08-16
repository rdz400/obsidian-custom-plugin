import {
    App,
    CachedMetadata,
    Notice,
    Reference,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

import { FilterBar, FilterChip } from './filterbar';
import {
    NoteTypeSetting,
    configuredTypes,
    noteType,
    noteTypeFilterValue,
    noteTypeFilters,
    renderTypePill,
} from './notetype';
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
    /**
     * Frontmatter `type` of the note an internal link resolves to, shown as a
     * pill; '' for a note without one and for the other kinds, which have no
     * frontmatter to read.
     */
    type: string;
    /**
     * What the row is searched and sorted by: the note name, the link text of
     * an external link that has one, and otherwise the URL or raw link text.
     */
    name: string;
    /**
     * Second line under the name: the note's folder, or the URL. A labelled
     * external link shows the whole address here, since the name no longer
     * carries it; an unlabelled one shows just the host, which the name repeats
     * in full anyway.
     */
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

/**
 * Schemes that carry no `//` but are external all the same. Matched as a whole
 * scheme so a note called `tel: numbers` or a Windows-style `c:` is not caught.
 */
const SCHEME_ONLY_RE = /^(mailto|tel):/i;

/**
 * A protocol-relative URL, as pasted from a browser that hid the scheme. Two
 * leading slashes never start a vault path, so this is always external.
 */
const PROTOCOL_RELATIVE_RE = /^\/\/[^/]/;

/** True when a link's target is a URL rather than a note in the vault. */
function isExternal(link: string): boolean {
    return (
        EXTERNAL_LINK_RE.test(link) ||
        SCHEME_ONLY_RE.test(link) ||
        PROTOCOL_RELATIVE_RE.test(link)
    );
}

/**
 * The host of a URL, lowercased, or '' when it has none or does not parse.
 *
 * A scheme-only link has no host, so its target is shown instead: `mailto:` and
 * `tel:` rows would otherwise carry a blank second line.
 */
function urlHost(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.host) return parsed.host.toLowerCase();
        // `mailto:a@b.com` → `a@b.com`, `tel:+31…` → `+31…`.
        return parsed.pathname || '';
    } catch {
        return '';
    }
}

/**
 * The key a URL is counted under, so the same destination written two ways
 * folds into one row: the scheme and host are case-insensitive per RFC 3986,
 * while the path is not and is left alone. A trailing slash on an empty path is
 * dropped, since `https://x.com` and `https://x.com/` are the same page.
 */
function urlKey(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.host = parsed.host.toLowerCase();
        if (parsed.pathname === '/') parsed.pathname = '';
        return parsed.href;
    } catch {
        return url;
    }
}

/** Strip the `#heading`/`^block` and `|display` tails from a wikilink target. */
function linkPath(link: string): string {
    return link.split('#')[0]?.split('|')[0]?.trim() ?? '';
}

/**
 * Markdown links and autolinks, which the metadata cache does not record when
 * they point outside the vault: Obsidian puts only internal links in
 * `cache.links`, so a note whose sole link is `[Google](https://google.nl/)`
 * has no `links` field at all. These have to be read from the text.
 *
 * Three shapes, in one pass so their positions interleave correctly:
 *
 * - `[label](target)`, with the label group allowing one level of nesting so
 *   an image link `[![alt](img)](href)` is seen as a link to `href`.
 * - `[label](<target>)`, where the angle brackets let a target hold spaces.
 * - `<https://…>`, a bare autolink.
 *
 * An optional `"title"` after the target is matched so it is not mistaken for
 * part of the address.
 */
const MD_LINK_RE = new RegExp(
    [
        // [label](<target> "title")
        /(?<bangA>!?)\[(?<labelA>(?:[^[\]]|\[[^[\]]*\])*)\]\(\s*<(?<angled>[^<>]*)>(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/
            .source,
        // [label](target "title") — target runs to whitespace or the closing
        // paren, with balanced pairs allowed so Wikipedia's `Foo_(bar)` survives.
        /(?<bangB>!?)\[(?<labelB>(?:[^[\]]|\[[^[\]]*\])*)\]\(\s*(?<plain>(?:[^\s()\\]|\\.|\([^()]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/
            .source,
        // <https://…>
        /<(?<auto>[a-z][a-z0-9+.-]*:[^<>\s]+)>/.source,
    ].join('|'),
    'gi',
);

/**
 * Spans the link scan must not look inside, blanked to spaces so every offset
 * after them still lines up with the original text.
 *
 * Code is masked because a link inside it is being shown, not followed, and
 * Obsidian does not render it as a link. Fenced and indented code come from the
 * section cache — the same parse Obsidian itself did — while inline spans have
 * no section of their own and are matched here.
 *
 * Wikilinks are masked too: they are already counted from `cache.links`, and
 * `[[Note]]` would otherwise also read as a markdown link to `Note`.
 */
function maskUnlinkedSpans(
    content: string,
    cache: CachedMetadata | null,
    bodyStart: number,
): string {
    const chars = [...content];
    const blank = (from: number, to: number): void => {
        for (let i = Math.max(from, bodyStart); i < Math.min(to, chars.length); i++) {
            // Newlines survive so line numbers stay correct after masking.
            if (chars[i] !== '\n') chars[i] = ' ';
        }
    };

    for (const section of cache?.sections ?? []) {
        if (section.type === 'code') {
            blank(section.position.start.offset, section.position.end.offset);
        }
    }

    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
        const start = link.position.start.offset;
        blank(start, start + (link.original?.length ?? 0));
    }

    // Inline code spans. Matched with a backtick run of equal length on both
    // sides, as CommonMark requires, so a stray backtick in prose does not open
    // a span that swallows the rest of the note.
    //
    // A span used as a link label — ``[`code`](https://…)`` — is left alone:
    // blanking it would hide the label from the scan and cost the row its name,
    // while the link itself is still a link and must be found. A span holding a
    // whole link — ``` `[L](https://…)` ``` — is still blanked, since there the
    // link is being shown rather than followed.
    const text = chars.join('');
    return text.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (whole, _t, at: number) => {
        const open = text.lastIndexOf('[', at);
        const isLabel =
            open !== -1 &&
            // Nothing between the `[` and this span may close the label, and
            // the span must have no brackets of its own — otherwise the link
            // lives inside the code rather than the code inside the label.
            !/[\][]/.test(text.slice(open + 1, at)) &&
            !/[[\]]/.test(whole) &&
            /^\]\(/.test(text.slice(at + whole.length));
        return isLabel ? whole : whole.replace(/[^\n]/g, ' ');
    });
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

/**
 * The plain text of a link label, so `[**Google** docs](…)` reads as
 * "Google docs" rather than carrying its markup into the list.
 *
 * A label that is only an image, as in `[![logo](logo.png)](https://…)`, gives
 * '' rather than the alt text: the link is wrapping a picture, and "logo"
 * names the image rather than the destination, so the row keeps its URL.
 */
function labelText(label: string): string {
    const text = label
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text;
}

/**
 * Record one URL, folded in with any other spelling of the same address.
 *
 * A protocol-relative `//host/path` is opened with https, since that is what a
 * browser does for a page served over https and there is no scheme to inherit.
 *
 * `label` is the link text of a markdown link, shown in place of the address:
 * a row reading "Google" is easier to pick out than one reading the URL. The
 * first label wins when the same URL is linked twice under different words, so
 * the row keeps the name it was listed under rather than changing on a later
 * mention.
 */
function addExternal(
    items: Map<string, OutgoingLinkItem>,
    target: string,
    line?: number,
    label?: string,
): void {
    const url = PROTOCOL_RELATIVE_RE.test(target) ? `https:${target}` : target;
    const text = label !== undefined ? labelText(label) : '';
    addLink(
        items,
        `url:${urlKey(url)}`,
        () => ({
            kind: 'external',
            url,
            type: '',
            // Shown as written, so the row reads the way the note does even
            // though same-address rows were folded together by their key.
            name: text || target,
            detail: text ? url : urlHost(url),
            count: 1,
        }),
        line,
    );
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
        addExternal(items, target, line);
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
                type: noteType(app, file),
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
            type: '',
            name: path,
            detail: 'not created yet',
            count: 1,
        }),
        line,
    );
}

/**
 * The chip value standing for "points at a website", which no note type can
 * collide with: a frontmatter `type` is a bare word, never a URL scheme.
 */
const EXTERNAL_FILTER = 'extern:';

/**
 * The second filter row: the one chip that narrows to the links leaving the
 * vault.
 *
 * Its own bar rather than a sixth chip in the first, because it does not
 * compete with the type chips the way they compete with each other — a
 * destination is a project *or* a book, but "external" cuts across the whole
 * list. Kept on Alt so both rows number their chips from 1.
 */
const EXTERNAL_FILTERS: FilterChip[] = [
    { value: EXTERNAL_FILTER, type: 'external', label: 'extern' },
];

/**
 * The type chip a row answers to.
 *
 * Everything that is not a note with a configured type falls to "overige": a
 * note whose type is blank or unlisted, a link to a note that does not exist
 * yet, and a link that leaves the vault. So every row is reachable by some
 * chip, which is what makes the bar safe to reach for — turning one on can
 * never hide a row that no chip could bring back.
 */
function filterValue(item: OutgoingLinkItem, configured: ReadonlySet<string>): string {
    if (item.kind !== 'note') return noteTypeFilterValue('', configured);
    return noteTypeFilterValue(item.type, configured);
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
 * Internal links come from the metadata cache. External ones are scanned out of
 * `content`, because Obsidian caches only links that stay inside the vault: a
 * note whose one link is `[Google](https://google.nl/)` has no cached links at
 * all, so the cache cannot be the source for those.
 *
 * A bare `https://…` typed into a paragraph is deliberately not listed — only
 * links written as `[text](url)`, `<url>` or `[[wikilink]]` count.
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

    // Reference-link definitions, `[ref]: https://…`. Obsidian does record
    // these, with a position, so they carry a line to jump to.
    for (const ref of cache?.referenceLinks ?? []) {
        const target = ref.link.trim();
        if (target !== '' && isExternal(target)) {
            addExternal(items, target, ref.position?.start.line);
        }
    }

    // Frontmatter is skipped: a `source: https://…` property is a value, not a
    // link, and counting it here would list every note's own metadata.
    const bodyStart = cache?.frontmatterPosition
        ? cache.frontmatterPosition.end.offset
        : 0;

    const body = maskUnlinkedSpans(content, cache, bodyStart);

    for (const match of body.slice(bodyStart).matchAll(MD_LINK_RE)) {
        const groups = match.groups ?? {};
        const raw = groups['angled'] ?? groups['plain'] ?? groups['auto'] ?? '';
        // A markdown link may also point inside the vault — `[text](Note.md)` —
        // so only the external ones are taken here; the cache already holds the
        // internal ones, with the resolution that turns them into notes.
        const target = raw.replace(/\\([()[\]\\])/g, '$1').trim();
        if (target === '' || !isExternal(target)) continue;
        const offset = bodyStart + (match.index ?? 0);
        const line = content.slice(0, offset).split('\n').length - 1;
        // An image is shown, not named: `![alt](…)` has alt text rather than a
        // label, and an autolink has none at all, so both keep the URL as their
        // name. Only a real `[label](…)` renames the row.
        const bang = groups['bangA'] ?? groups['bangB'] ?? '';
        const label = groups['labelA'] ?? groups['labelB'];
        addExternal(items, target, line, bang === '' ? label : undefined);
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
    private readonly noteTypes: readonly NoteTypeSetting[];
    /** The type values with a chip of their own; the rest answer to "overige". */
    private readonly configured: ReadonlySet<string>;
    private readonly typeFilters: FilterBar;
    private readonly externalFilters: FilterBar;
    private readonly typeChips: FilterChip[];

    constructor(
        app: App,
        source: TFile,
        items: OutgoingLinkItem[],
        noteTypes: readonly NoteTypeSetting[],
        onChoose: (item: OutgoingLinkItem, event: MouseEvent | KeyboardEvent) => void,
    ) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        this.noteTypes = noteTypes;
        this.configured = configuredTypes(noteTypes);
        this.typeChips = noteTypeFilters(noteTypes);
        this.setPlaceholder(`Search links in ${source.basename}…`);
        this.modalEl.addClass('ronald-backlink-search');
        registerNewTabEnter(this);
        registerAltEnter(this);

        this.typeFilters = new FilterBar({
            chips: this.typeChips,
            onChange: () => this.rerunSearch(),
        });
        this.externalFilters = new FilterBar({
            chips: EXTERNAL_FILTERS,
            onChange: () => this.rerunSearch(),
            // Its own modifier, so both rows can number their chips from 1.
            modifier: 'alt',
        });
        this.mountFilters();

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bars are on screen before that, so seed them here.
        this.typeFilters.setCounts(this.typeCounts(''));
        this.externalFilters.setCounts(this.externalCounts(''));
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
     * without colliding: the types are Mod+1…, "extern" is Alt+1. A press is
     * offered to each in turn and at most one takes it.
     */
    private mountFilters(): void {
        const anchor = this.inputEl.parentElement;
        anchor?.insertAdjacentElement('afterend', this.typeFilters.el);
        this.typeFilters.el.insertAdjacentElement('afterend', this.externalFilters.el);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                const handled =
                    this.typeFilters.handleKeyDown(event) ||
                    this.externalFilters.handleKeyDown(event);
                if (!handled) return;

                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /**
     * Re-run the current query so the results reflect a changed filter.
     *
     * `onInput` is what Obsidian's own input listener calls; it replaces the
     * result list in place. Dispatching an `input` event instead appends a
     * second set of results on top of the old ones, so it is not an option.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    /** True when the query appears in the row's name or its detail line. */
    private matchesQuery(item: OutgoingLinkItem, q: string): boolean {
        // The detail line is matched too, so a query can narrow to one folder
        // or to a host without having to name the note or the full URL.
        return (
            item.name.toLowerCase().includes(q) || item.detail.toLowerCase().includes(q)
        );
    }

    /** True when the row's type answers to one of the type chips that are on. */
    private matchesType(item: OutgoingLinkItem): boolean {
        const wanted = this.typeFilters.activeValues;
        return wanted.size === 0 || wanted.has(filterValue(item, this.configured));
    }

    /**
     * True unless the "extern" chip is filtering the row away.
     *
     * The chip narrows, like the type chips do, and starts off: the whole list
     * is shown until it is switched on, and switching it on cuts the list down
     * to the links that leave the vault — for when the question is which sites
     * a note points at and the notes are in the way.
     */
    private matchesExternal(item: OutgoingLinkItem): boolean {
        if (!this.externalFilters.activeValues.has(EXTERNAL_FILTER)) return true;
        return item.kind === 'external';
    }

    getSuggestions(query: string): OutgoingLinkItem[] {
        const q = query.toLowerCase();
        const matches = this.items.filter(
            (item) =>
                this.matchesType(item) &&
                this.matchesExternal(item) &&
                this.matchesQuery(item, q),
        );

        this.typeFilters.setCounts(this.typeCounts(q));
        this.externalFilters.setCounts(this.externalCounts(q));
        return matches;
    }

    /**
     * How many destinations each type chip stands for, given the query.
     *
     * The chips are OR'd together, so turning one on only ever adds its own
     * matches regardless of which others are active — the count for a chip is
     * how many rows answer to it and match the query.
     *
     * The "extern" chip is applied first, so the numbers add up to what the
     * list actually shows: with it on, "overige" counts only the websites,
     * which is all that chip could bring back while the list is narrowed.
     */
    private typeCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();

        for (const { value } of this.typeChips) {
            counts.set(
                value,
                this.items.filter(
                    (item) =>
                        filterValue(item, this.configured) === value &&
                        this.matchesExternal(item) &&
                        this.matchesQuery(item, q),
                ).length,
            );
        }

        return counts;
    }

    /**
     * How many websites the "extern" chip stands for, given the query.
     *
     * Counted against the type row as it stands, since that is what the list
     * would be cut down to were the chip pressed.
     */
    private externalCounts(q: string): Map<string, number> {
        return new Map([
            [
                EXTERNAL_FILTER,
                this.items.filter(
                    (item) =>
                        item.kind === 'external' &&
                        this.matchesType(item) &&
                        this.matchesQuery(item, q),
                ).length,
            ],
        ]);
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

        // A website has no frontmatter to carry a type, so it is pilled by what
        // it is instead — otherwise the external rows would be the only ones
        // with nothing at the right edge, which reads as missing data.
        if (item.kind === 'external') {
            const pill = title.createSpan({
                cls: 'ronald-backlink-type ronald-backlink-type-extern',
            });
            setIcon(pill.createSpan(), 'globe');
            pill.createSpan({ text: 'extern' });
            return;
        }

        renderTypePill(title, item.type, this.noteTypes);
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
 *
 * `noteTypes` comes from the settings and decides which types get a chip of
 * their own; everything else answers to the "overige" chip.
 */
export async function searchOutgoingLinks(
    app: App,
    noteTypes: readonly NoteTypeSetting[],
): Promise<void> {
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

    new OutgoingLinkSearchModal(app, source, items, noteTypes, (item, event) => {
        if (wantsAltAction(event)) {
            openMention(app, source, item, event);
            return;
        }
        // Alt is checked first, so a plain or Mod-modified press lands here and
        // `openFileFromSearch` decides which tab the note goes in.
        openDestination(app, item, event);
    }).open();
}
