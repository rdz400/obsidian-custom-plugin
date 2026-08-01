import {
    App,
    ListItemCache,
    Notice,
    SuggestModal,
    TFile,
    getAllTags,
    setIcon,
} from 'obsidian';

import { FilterBar, FilterChip } from './filterbar';

/** Statuses that mark a project as no longer running. */
const CLOSED_PROJECT_STATUSES = ['klaar', 'geannuleerd'];

/** Order in which open projects are listed in the search modal. */
const PROJECT_STATUS_ORDER = ['actief', 'backlog', 'wachten', 'misschien'];

/** Lucide icon per project status; used for the status pill. */
const STATUS_ICONS: Record<string, string> = {
    actief: 'play',
    backlog: 'list',
    wachten: 'clock',
    misschien: 'help-circle',
    klaar: 'check',
    geannuleerd: 'x',
};

/**
 * Status chips offered as filters under the search field, clickable and
 * reachable as Mod+1…Mod+9 in this order. Each chip shows how many projects
 * it matches, so the shortcut is a tooltip rather than printed on the chip.
 *
 * `type` groups every status the same way for now; the bar only needs it to
 * key `.ronald-task-filter-type-<type>` in `styles.css`.
 */
const STATUS_FILTERS: FilterChip[] = [
    { value: 'actief', type: 'status', label: 'actief' },
    { value: 'backlog', type: 'status', label: 'backlog' },
    { value: 'misschien', type: 'status', label: 'misschien' },
    { value: 'wachten', type: 'status', label: 'wachten' },
];

/** A project note plus the metadata shown in the search modal. */
export interface ProjectItem {
    file: TFile;
    status: string;
    tags: string[];
    /** Open tasks in "taken" notes that link to this project. */
    openTasks: number;
}

const TASK_LINE_RE = /^(\s*[-*+]\s+)\[([^\]])\]\s?/;
const LINK_RE = /\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** The wikilink targets on one line, using the display text where given. */
function linksOnLine(raw: string): string[] {
    return Array.from(raw.matchAll(LINK_RE)).map((m) => (m[2] ?? m[1] ?? '').trim());
}

/** Append the entries of `extra` that `into` doesn't already have. */
function addMissing(into: string[], extra: string[]): string[] {
    return [...into, ...extra.filter((entry) => !into.includes(entry))];
}

/**
 * Count the open checkbox lines in one note against the project each links to.
 *
 * `listItems` is flat and ordered by position, with `parent` holding the start
 * line of the containing item (negative for a top-level item, where it encodes
 * the section instead). Since a parent always appears before its children, one
 * forward pass indexed by start line is enough to give every line the links its
 * ancestors carry on top of its own — so a subtask under "- [ ] Bel [[Tuin]]"
 * counts towards Tuin even though its own line names no project. Plain bullets
 * take part in that inheritance without being tasks themselves.
 *
 * A task linking to several projects counts once for each of them.
 */
function countFileTasks(
    items: ListItemCache[],
    lines: string[],
    counts: Map<string, number>,
): void {
    const inherited = new Map<number, string[]>();

    for (const item of items) {
        const line = item.position.start.line;
        const raw = lines[line];
        if (raw === undefined) continue;

        const parent = item.parent < 0 ? undefined : inherited.get(item.parent);
        const links = addMissing(linksOnLine(raw), parent ?? []);
        inherited.set(line, links);

        const marker = TASK_LINE_RE.exec(raw)?.[2];
        if (marker === undefined || marker === 'x' || marker === 'X') continue;

        for (const link of links) {
            const key = link.toLowerCase();
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
}

/**
 * How many open tasks each linked note has, keyed by lowercased link target.
 *
 * Only "taken" notes are scanned, matching where tasks are kept; the count is
 * looked up per project by note name, so a link written as a path or with a
 * display text only lands on the project when it reads as the note's name.
 */
async function collectOpenTaskCounts(app: App): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    const files = app.vault
        .getMarkdownFiles()
        .filter(
            (file) =>
                app.metadataCache.getFileCache(file)?.frontmatter?.type === 'taken',
        );

    for (const file of files) {
        const items = app.metadataCache.getFileCache(file)?.listItems ?? [];
        if (items.length === 0) continue;

        const lines = (await app.vault.cachedRead(file)).split('\n');
        countFileTasks(items, lines, counts);
    }

    return counts;
}

/** Sort rank for a status; unknown or missing statuses sort last. */
function projectStatusRank(status: string): number {
    const index = PROJECT_STATUS_ORDER.indexOf(status);
    return index === -1 ? PROJECT_STATUS_ORDER.length : index;
}

/** Collect the metadata shown for a project in the search modal. */
function toProjectItem(
    app: App,
    file: TFile,
    taskCounts: ReadonlyMap<string, number>,
): ProjectItem {
    const cache = app.metadataCache.getFileCache(file);
    const status: unknown = cache?.frontmatter?.status;

    return {
        file,
        status: typeof status === 'string' ? status : '',
        tags: cache ? [...new Set(getAllTags(cache) ?? [])] : [],
        openTasks: taskCounts.get(file.basename.toLowerCase()) ?? 0,
    };
}

/** Every project note that is still running, in display order. */
export async function collectOpenProjects(app: App): Promise<ProjectItem[]> {
    const taskCounts = await collectOpenTaskCounts(app);

    return app.vault
        .getMarkdownFiles()
        .filter((file) => {
            const fm = app.metadataCache.getFileCache(file)?.frontmatter;
            if (fm?.type !== 'project') return false;
            const status: unknown = fm.status;
            return (
                typeof status !== 'string' ||
                !CLOSED_PROJECT_STATUSES.includes(status)
            );
        })
        .map((file) => toProjectItem(app, file, taskCounts))
        .sort(
            (a, b) =>
                projectStatusRank(a.status) - projectStatusRank(b.status) ||
                a.file.basename.localeCompare(b.file.basename),
        );
}

/**
 * Search projects by note name and show their status and tags. Choosing a
 * project opens the note.
 */
export class ProjectSearchModal extends SuggestModal<ProjectItem> {
    private items: ProjectItem[];
    private onChoose: (item: ProjectItem) => void;
    private readonly filters: FilterBar;

    constructor(
        app: App,
        items: ProjectItem[],
        onChoose: (item: ProjectItem) => void,
    ) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        this.setPlaceholder('Search projects…');
        this.modalEl.addClass('ronald-project-search');

        this.filters = new FilterBar({
            chips: STATUS_FILTERS,
            onChange: () => this.rerunSearch(),
        });
        this.mountFilters();

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bar is on screen before that, so seed it here.
        this.filters.setCounts(this.statusCounts(''));
    }

    /**
     * Place the status chips and give them their keyboard shortcuts.
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
     * Re-run the current query so the results reflect a changed status filter.
     *
     * `onInput` is what Obsidian's own input listener calls; it replaces the
     * result list in place. Dispatching an `input` event instead appends a
     * second set of results on top of the old ones, so it is not an option.
     */
    private rerunSearch(): void {
        (this as unknown as { onInput(): void }).onInput();
    }

    /**
     * True when the project's status is one of `wanted` (or `wanted` is
     * empty, in which case every status matches).
     *
     * A project has exactly one status, so unlike task tags this is an OR
     * across active chips rather than an AND: turning on "actief" and
     * "wachten" shows projects in either status, not neither.
     */
    private matchesStatus(item: ProjectItem, wanted: ReadonlySet<string>): boolean {
        return wanted.size === 0 || wanted.has(item.status);
    }

    getSuggestions(query: string): ProjectItem[] {
        const q = query.toLowerCase();
        const matches = this.items.filter(
            (item) =>
                this.matchesStatus(item, this.filters.activeValues) &&
                item.file.basename.toLowerCase().includes(q),
        );

        this.filters.setCounts(this.statusCounts(q));
        return matches;
    }

    /**
     * How many projects each status chip stands for, given the query.
     *
     * Status chips are OR'd together (see `matchesStatus`), so turning one on
     * only ever adds its own matches to the result regardless of which other
     * chips are active — the count for a chip is simply how many projects
     * carry that status and match the query.
     */
    private statusCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();

        for (const { value: status } of STATUS_FILTERS) {
            const total = this.items.filter(
                (item) =>
                    item.status === status &&
                    item.file.basename.toLowerCase().includes(q),
            ).length;
            counts.set(status, total);
        }

        return counts;
    }

    renderSuggestion(item: ProjectItem, el: HTMLElement): void {
        el.addClass('ronald-project-match');

        const title = el.createDiv({ cls: 'ronald-project-title' });
        setIcon(title.createSpan({ cls: 'ronald-project-icon' }), 'file-text');
        title.createSpan({ text: item.file.basename });

        // Before the status, so the status keeps the right edge of the row to
        // itself and lines up from project to project. The slot is created
        // either way and holds its width when empty, see `styles.css`; a
        // project with nothing open shows no "0" to read past.
        const tasks = title.createSpan({ cls: 'ronald-project-tasks' });
        if (item.openTasks > 0) {
            tasks.setAttr(
                'aria-label',
                `${item.openTasks} open ${item.openTasks === 1 ? 'task' : 'tasks'}`,
            );
            setIcon(tasks.createSpan(), 'list-checks');
            tasks.createSpan({ text: String(item.openTasks) });
        }

        if (item.status) {
            const status = title.createSpan({
                cls: `ronald-project-status ronald-project-status-${item.status}`,
            });
            const icon = STATUS_ICONS[item.status];
            if (icon) setIcon(status.createSpan(), icon);
            status.createSpan({ text: item.status });
        }

        if (item.tags.length === 0) return;

        const meta = el.createDiv({ cls: 'ronald-project-meta' });
        const tags = meta.createDiv({ cls: 'ronald-project-tags' });
        for (const tag of item.tags) {
            tags.createSpan({ cls: 'ronald-project-tag', text: tag });
        }
    }

    onChooseSuggestion(item: ProjectItem): void {
        this.onChoose(item);
    }
}

/**
 * Search open projects by note name in a modal that shows their status and
 * tags, and open the chosen note.
 */
export async function searchProjects(app: App): Promise<void> {
    const projects = await collectOpenProjects(app);

    if (projects.length === 0) {
        new Notice('No open projects found');
        return;
    }

    new ProjectSearchModal(app, projects, (item: ProjectItem) => {
        const leaf =
            app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ??
            app.workspace.getLeaf(false);
        void leaf.openFile(item.file);
    }).open();
}
