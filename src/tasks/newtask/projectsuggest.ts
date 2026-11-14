import { AbstractInputSuggest, App, prepareFuzzySearch, TFile } from 'obsidian';

/**
 * Suggests projects under the project field of the "New task" modal, best
 * fuzzy match first. Choosing one writes its name into the field; the field's
 * text is what counts when the task is added (see `findproject.ts`).
 */
export class ProjectSuggest extends AbstractInputSuggest<TFile> {
    constructor(
        app: App,
        inputEl: HTMLInputElement,
        private readonly projects: readonly TFile[],
    ) {
        super(app, inputEl);
    }

    protected getSuggestions(query: string): TFile[] {
        const search = prepareFuzzySearch(query.trim());
        return this.projects
            .flatMap((file) => {
                const match = search(file.basename);
                return match ? [{ file, score: match.score }] : [];
            })
            .sort((a, b) => b.score - a.score)
            .map(({ file }) => file);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.basename);
    }

    selectSuggestion(file: TFile): void {
        this.setValue(file.basename);
        this.close();
    }
}
