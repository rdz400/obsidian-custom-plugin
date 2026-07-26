import { App, FuzzySuggestModal, SuggestModal, TFile } from 'obsidian';

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
