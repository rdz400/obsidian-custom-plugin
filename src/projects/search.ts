import {
    App,
    MarkdownView,
    Notice,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

import { FilterBar, FilterChip } from '../shared/ui/filterbar';
import {
    openFileFromSearch,
    registerAltEnter,
    registerNewTabEnter,
    wantsAltAction,
} from '../shared/ui/openfile';
import { isDoneMarker } from '../shared/taskline';
import { readTaskNoteLines } from '../shared/tasknotes';
import { templateMatcher } from '../shared/vault';
import { isOpenStatus } from './statuses';

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

/** The state a caller can hand the project search to open with. */
export interface ProjectSearchPreset {
    /** Text to put in the search field, as if the user had typed it. */
    query?: string;
    /** Status chips to switch on up front; values with no chip are ignored. */
    activeStatuses?: readonly string[];
    /** Task chips to switch on up front: "met-taken" and/or "zonder-taken". */
    activeTaskFilters?: readonly string[];
}

/** A project note plus the metadata shown in the search modal. */
export interface ProjectItem {
    file: TFile;
    status: string;
    /** Open tasks in task notes that link to this project. */
    openTasks: number;
}

/**
 * How many open tasks link to each note, keyed by the note's path.
 *
 * Only task notes are scanned, matching where tasks are kept. A task counts
 * for the links on its own line and on the list items it hangs under (see
 * `listLines`), so a subtask under "- [ ] Bel [[Tuin]]" counts towards Tuin.
 * Each link is resolved the way Obsidian resolves it, so a link written as a
 * path or with a display text counts too. A task linking to several projects
 * counts once for each of them, and once for a project it links to twice.
 */
async function collectOpenTaskCounts(
    app: App,
    taskFolder: string,
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    for (const { file, lines } of await readTaskNoteLines(app, taskFolder)) {
        for (const { marker, links } of lines) {
            if (marker === undefined || isDoneMarker(marker)) continue;

            const targets = new Set<string>();
            for (const link of links) {
                const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
                if (target) targets.add(target.path);
            }
            for (const path of targets) counts.set(path, (counts.get(path) ?? 0) + 1);
        }
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
        openTasks: taskCounts.get(file.path) ?? 0,
    };
}

/** Every project note that is still running, in display order. */
export async function collectOpenProjects(
    app: App,
    taskFolder: string,
): Promise<ProjectItem[]> {
    const taskCounts = await collectOpenTaskCounts(app, taskFolder);

    const isTemplate = templateMatcher(app);

    return app.vault
        .getMarkdownFiles()
        .filter((file) => {
            if (isTemplate(file)) return false;
            const fm = app.metadataCache.getFileCache(file)?.frontmatter;
            if (fm?.type !== 'project') return false;
            return isOpenStatus(fm.status);
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
 * Alt+Enter copies and inserts a wikilink to it instead — `onChoose` decides
 * which from the event it's handed.
 */
export class ProjectSearchModal extends SuggestModal<ProjectItem> {
    private items: ProjectItem[];
    /** Called with the chosen project and the press that chose it. */
    private onChoose: (item: ProjectItem, event: MouseEvent | KeyboardEvent) => void;
    private readonly statusFilters: FilterBar;
    private readonly taskFilters: FilterBar;
    private readonly initialQuery: string;

    constructor(
        app: App,
        items: ProjectItem[],
        onChoose: (item: ProjectItem, event: MouseEvent | KeyboardEvent) => void,
        preset: ProjectSearchPreset = {},
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

        // Toggled before the modal is on screen, so the first render already
        // shows the preset selection; `toggle` drops values with no chip.
        for (const status of preset.activeStatuses ?? []) {
            this.statusFilters.toggle(status);
        }
        for (const value of preset.activeTaskFilters ?? []) {
            this.taskFilters.toggle(value);
        }

        this.initialQuery = preset.query ?? '';

        // `getSuggestions` keeps the counts current from the first keystroke
        // on, but the bars are on screen before that, so seed them here.
        const q = this.initialQuery.toLowerCase();
        this.statusFilters.setCounts(this.statusCounts(q));
        this.taskFilters.setCounts(this.taskCounts(q));
    }

    /**
     * Seed the search field once the modal is up.
     *
     * The value has to be written after `super.onOpen` has run: Obsidian renders
     * the empty result list on open, and setting the text before that would be
     * overwritten by it. `rerunSearch` then produces the matches, which typing
     * would otherwise be needed for.
     */
    onOpen(): void {
        void super.onOpen();
        if (this.initialQuery.length === 0) return;

        this.inputEl.value = this.initialQuery;
        // Leaves the cursor at the end so the query reads as typed and can be
        // edited or cleared straight away.
        this.inputEl.setSelectionRange(this.initialQuery.length, this.initialQuery.length);
        this.rerunSearch();
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
 * copies a wikilink to it to the clipboard and, when a note is open, also
 * inserts that link at the cursor.
 */
export async function searchProjects(
    app: App,
    taskFolder: string,
    preset: ProjectSearchPreset = {},
): Promise<void> {
    const projects = await collectOpenProjects(app, taskFolder);

    if (projects.length === 0) {
        new Notice('No open projects found');
        return;
    }

    new ProjectSearchModal(app, projects, (item, event) => {
        if (wantsAltAction(event)) {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            const sourcePath = view?.file?.path ?? '';
            const link = app.fileManager.generateMarkdownLink(item.file, sourcePath);
            void navigator.clipboard.writeText(link);
            if (view) {
                view.editor.replaceSelection(link);
                new Notice(`Inserted link to ${item.file.basename}`);
            } else {
                new Notice(`Copied link to ${item.file.basename}`);
            }
            return;
        }
        openFileFromSearch(app, item.file, event);
    }, preset).open();
}
