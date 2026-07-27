import {
    App,
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
}

/** Sort rank for a status; unknown or missing statuses sort last. */
function projectStatusRank(status: string): number {
    const index = PROJECT_STATUS_ORDER.indexOf(status);
    return index === -1 ? PROJECT_STATUS_ORDER.length : index;
}

/** Collect the metadata shown for a project in the search modal. */
function toProjectItem(app: App, file: TFile): ProjectItem {
    const cache = app.metadataCache.getFileCache(file);
    const status: unknown = cache?.frontmatter?.status;

    return {
        file,
        status: typeof status === 'string' ? status : '',
        tags: cache ? [...new Set(getAllTags(cache) ?? [])] : [],
    };
}

/** Every project note that is still running, in display order. */
export function collectOpenProjects(app: App): ProjectItem[] {
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
        .map((file) => toProjectItem(app, file))
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
export function searchProjects(app: App): void {
    const projects = collectOpenProjects(app);

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
