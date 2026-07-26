import {
    App,
    Notice,
    SuggestModal,
    TFile,
    getAllTags,
    setIcon,
} from 'obsidian';

import { addKeyboardDismissButton } from './keyboarddismiss';

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
        addKeyboardDismissButton(this);
    }

    getSuggestions(query: string): ProjectItem[] {
        const q = query.toLowerCase();
        return this.items.filter((item) =>
            item.file.basename.toLowerCase().includes(q),
        );
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
