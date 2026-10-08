import { App, Editor, FuzzySuggestModal, MarkdownView, Notice } from 'obsidian';

/** Fuzzy search over the one-line snippets from the settings. */
class SnippetSuggestModal extends FuzzySuggestModal<string> {
    private snippets: string[];
    private onChoose: (snippet: string) => void;

    constructor(app: App, snippets: string[], onChoose: (snippet: string) => void) {
        super(app);
        this.snippets = snippets;
        this.onChoose = onChoose;
        this.setPlaceholder('Search snippets');
    }

    getItems(): string[] {
        return this.snippets;
    }

    getItemText(snippet: string): string {
        return snippet;
    }

    onChooseItem(snippet: string): void {
        this.onChoose(snippet);
    }
}

/**
 * Pick one of `snippets` and insert it at the cursor, replacing the selection.
 *
 * Without an `editor`, as from the ribbon, the active note's editor is used;
 * it is looked up before the modal opens, since the modal takes focus.
 */
export function insertSnippet(app: App, snippets: string[], editor?: Editor): void {
    const target = editor ?? app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!target) {
        new Notice('Open a note to insert a snippet');
        return;
    }

    // Blank rows are what "Add snippet" leaves until something is typed.
    const items = snippets.filter((snippet) => snippet.length > 0);
    if (items.length === 0) {
        new Notice('No snippets yet; add them in the settings');
        return;
    }

    new SnippetSuggestModal(app, items, (snippet) => {
        target.replaceSelection(snippet);
        target.focus();
    }).open();
}
