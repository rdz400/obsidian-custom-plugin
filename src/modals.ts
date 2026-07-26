import {
    App,
    FuzzySuggestModal,
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';

export class TagSuggestModal extends SuggestModal<string> {
    private tags: string[];
    private onChoose: (tag: string) => void;

    constructor(app: App, tags: string[], onChoose: (tag: string) => void) {
        super(app);
        this.tags = tags;
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): string[] {
        const q = query.toLowerCase();
        return this.tags.filter((tag) => tag.toLowerCase().includes(q));
    }

    renderSuggestion(tag: string, el: HTMLElement): void {
        el.setText(`#${tag}`);
    }

    onChooseSuggestion(tag: string): void {
        this.onChoose(tag);
    }
}

export class StringSuggestModal extends SuggestModal<string> {
    private options: string[];
    private onChoose: (value: string) => void;

    constructor(app: App, options: string[], onChoose: (value: string) => void) {
        super(app);
        this.options = options;
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): string[] {
        const q = query.toLowerCase();
        return this.options.filter((option) => option.toLowerCase().includes(q));
    }

    renderSuggestion(option: string, el: HTMLElement): void {
        el.setText(option);
    }

    onChooseSuggestion(option: string): void {
        this.onChoose(option);
    }
}

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
    private onChoose: (file: TFile) => void;
    private items: TFile[];

    constructor(app: App, onChoose: (file: TFile) => void, items?: TFile[]) {
        super(app);
        this.onChoose = onChoose;
        this.items = items ?? app.vault.getMarkdownFiles();
    }

    getItems(): TFile[] {
        return this.items;
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile): void {
        this.onChoose(item);
    }
}

/** A project note plus the metadata shown in the search modal. */
export interface ProjectItem {
    file: TFile;
    status: string;
    tags: string[];
    links: string[];
}

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
 * Search projects by note name and show their status, tags and outgoing
 * wikilinks. Choosing a project opens the note.
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

        if (item.tags.length === 0 && item.links.length === 0) return;

        const meta = el.createDiv({ cls: 'ronald-project-meta' });

        if (item.tags.length > 0) {
            const tags = meta.createDiv({ cls: 'ronald-project-tags' });
            for (const tag of item.tags) {
                tags.createSpan({ cls: 'ronald-project-tag', text: tag });
            }
        }

        if (item.links.length > 0) {
            const links = meta.createDiv({ cls: 'ronald-project-links' });
            for (const link of item.links) {
                const pill = links.createSpan({ cls: 'ronald-project-link' });
                setIcon(pill.createSpan(), 'link');
                pill.createSpan({ text: link });
            }
        }
    }

    onChooseSuggestion(item: ProjectItem): void {
        this.onChoose(item);
    }
}
