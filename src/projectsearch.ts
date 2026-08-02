import {
    App,
    ListItemCache,
    Notice,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

import { getTemplatesFolder } from './commands';
import { FilterBar, FilterChip } from './filterbar';
import {
    openFileFromSearch,
    registerAltEnter,
    registerNewTabEnter,
    wantsAltAction,
} from './openfile';

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

/**
 * Task chips offered as a second filter row, on the open task count that
 * `collectOpenTaskCounts` already works out for the badge on every row.
 *
 * The two values are exhaustive and mutually exclusive, so turning both on
 * matches everything, exactly as turning neither on does.
 */
const TASK_FILTERS: FilterChip[] = [
    { value: 'met-taken', type: 'tasks', label: 'met taken' },
    { value: 'zonder-taken', type: 'tasks', label: 'zonder taken' },
];

/** True when a project's open task count fits the chip `value` stands for. */
function matchesTaskFilter(item: ProjectItem, value: string): boolean {
    return value === 'met-taken' ? item.openTasks > 0 : item.openTasks === 0;
}

/** A project note plus the metadata shown in the search modal. */
export interface ProjectItem {
    file: TFile;
    status: string;
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
        openTasks: taskCounts.get(file.basename.toLowerCase()) ?? 0,
    };
}

/** Every project note that is still running, in display order. */
export async function collectOpenProjects(app: App): Promise<ProjectItem[]> {
    const taskCounts = await collectOpenTaskCounts(app);

    const templatesFolder = getTemplatesFolder(app);
    const isTemplate = (file: TFile): boolean =>
        templatesFolder !== null &&
        (file.path === templatesFolder || file.path.startsWith(`${templatesFolder}/`));

    return app.vault
        .getMarkdownFiles()
        .filter((file) => {
            if (isTemplate(file)) return false;
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
 * Search projects by note name and show their status and open task count.
 * Choosing a project opens the note, in a new tab with Mod+Enter, or with
 * Alt+Enter copies a wikilink to it instead — `onChoose` decides which from
 * the event it's handed.
 */
export class ProjectSearchModal extends SuggestModal<ProjectItem> {
    private items: ProjectItem[];
    /** Called with the chosen project and the press that chose it. */
    private onChoose: (item: ProjectItem, event: MouseEvent | KeyboardEvent) => void;
    private readonly statusFilters: FilterBar;
    private readonly taskFilters: FilterBar;

    constructor(
        app: App,
        items: ProjectItem[],
        onChoose: (item: ProjectItem, event: MouseEvent | KeyboardEvent) => void,
    ) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        this.setPlaceholder('Search projects…');
        this.modalEl.addClass('ronald-project-search');
        registerNewTabEnter(this);
        registerAltEnter(this);

        this.statusFilters = new FilterBar({
            chips: STATUS_FILTERS,
            onChange: () => this.rerunSearch(),
        });
        this.taskFilters = new FilterBar({
            chips: TASK_FILTERS,
            onChange: () => this.rerunSearch(),
            // Its own modifier, so both rows can number their chips from 1.
            modifier: 'alt',
        });
        this.mountFilters();

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bars are on screen before that, so seed them here.
        this.statusFilters.setCounts(this.statusCounts(''));
        this.taskFilters.setCounts(this.taskCounts(''));
    }

    /**
     * Place both chip rows and give them their keyboard shortcuts.
     *
     * Shortcuts are listened for on the modal rather than the input so they
     * work wherever focus sits, in the capture phase so Obsidian's own Mod+digit
     * bindings never see a press meant for a chip.
     *
     * Each bar answers to its own modifier, so both number their chips from 1
     * without colliding: the statuses are Mod+1…4, the task chips Alt+1…2. A
     * press is offered to each in turn and at most one takes it.
     */
    private mountFilters(): void {
        const anchor = this.inputEl.parentElement;
        anchor?.insertAdjacentElement('afterend', this.statusFilters.el);
        this.statusFilters.el.insertAdjacentElement('afterend', this.taskFilters.el);

        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                const handled =
                    this.statusFilters.handleKeyDown(event) ||
                    this.taskFilters.handleKeyDown(event);
                if (!handled) return;

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

    /**
     * True when the project's open task count fits one of `wanted` (or
     * `wanted` is empty, in which case every project matches).
     *
     * OR'd like the statuses, and for the same reason: a project either has
     * open tasks or it does not, so an AND across both chips would match
     * nothing at all.
     */
    private matchesTasks(item: ProjectItem, wanted: ReadonlySet<string>): boolean {
        if (wanted.size === 0) return true;
        return [...wanted].some((value) => matchesTaskFilter(item, value));
    }

    getSuggestions(query: string): ProjectItem[] {
        const q = query.toLowerCase();
        const matches = this.items.filter(
            (item) =>
                this.matchesStatus(item, this.statusFilters.activeValues) &&
                this.matchesTasks(item, this.taskFilters.activeValues) &&
                item.file.basename.toLowerCase().includes(q),
        );

        this.statusFilters.setCounts(this.statusCounts(q));
        this.taskFilters.setCounts(this.taskCounts(q));
        return matches;
    }

    /**
     * How many projects each status chip stands for, given the query.
     *
     * Status chips are OR'd together (see `matchesStatus`), so turning one on
     * only ever adds its own matches to the result regardless of which other
     * status chips are active — the count for a chip is how many projects
     * carry that status and match the query.
     *
     * The task bar ANDs with this one, though, so its active chips do narrow
     * what turning a status on would yield, and the count honours them.
     */
    private statusCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();
        const wantedTasks = this.taskFilters.activeValues;

        for (const { value: status } of STATUS_FILTERS) {
            const total = this.items.filter(
                (item) =>
                    item.status === status &&
                    this.matchesTasks(item, wantedTasks) &&
                    item.file.basename.toLowerCase().includes(q),
            ).length;
            counts.set(status, total);
        }

        return counts;
    }

    /**
     * How many projects each task chip stands for, given the query.
     *
     * The mirror of `statusCounts`: OR'd within the bar, so a chip counts its
     * own matches, and narrowed by the active statuses because the two bars
     * AND together.
     */
    private taskCounts(q: string): Map<string, number> {
        const counts = new Map<string, number>();
        const wantedStatuses = this.statusFilters.activeValues;

        for (const { value } of TASK_FILTERS) {
            const total = this.items.filter(
                (item) =>
                    matchesTaskFilter(item, value) &&
                    this.matchesStatus(item, wantedStatuses) &&
                    item.file.basename.toLowerCase().includes(q),
            ).length;
            counts.set(value, total);
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
    }

    onChooseSuggestion(item: ProjectItem, event: MouseEvent | KeyboardEvent): void {
        this.onChoose(item, event);
    }
}

/**
 * Search open projects by note name in a modal that shows their status and
 * open task count. Choosing a project opens its note — in the active tab, or
 * in a new one with Mod+Enter — while Alt+Enter (Option+Enter on macOS)
 * copies a wikilink to it to the clipboard instead.
 */
export async function searchProjects(app: App): Promise<void> {
    const projects = await collectOpenProjects(app);

    if (projects.length === 0) {
        new Notice('No open projects found');
        return;
    }

    new ProjectSearchModal(app, projects, (item, event) => {
        if (wantsAltAction(event)) {
            const sourcePath = app.workspace.getActiveFile()?.path ?? '';
            const link = app.fileManager.generateMarkdownLink(item.file, sourcePath);
            void navigator.clipboard.writeText(link);
            new Notice(`Copied link to ${item.file.basename}`);
            return;
        }
        openFileFromSearch(app, item.file, event);
    }).open();
}
