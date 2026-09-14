import { App, FuzzySuggestModal, TFolder } from 'obsidian';

/**
 * Pick a folder from the vault.
 *
 * The vault root is offered as "/" so the top level can be picked like any other
 * folder; everything else is listed by path, which is what distinguishes two
 * folders of the same name in different parents.
 */
export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    private onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Select a folder');
    }

    getItems(): TFolder[] {
        const folders: TFolder[] = [];
        // getAllLoadedFiles is the only walk that includes the root itself.
        for (const file of this.app.vault.getAllLoadedFiles()) {
            if (file instanceof TFolder) folders.push(file);
        }
        return folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    getItemText(folder: TFolder): string {
        return folder.isRoot() ? '/' : folder.path;
    }

    onChooseItem(folder: TFolder): void {
        this.onChoose(folder);
    }
}
