import { App, Modal, Setting, TFolder } from 'obsidian';

import type { PlannedRename } from './renamefiles';

/**
 * Show the planned renames and ask to go ahead.
 *
 * Every rename is listed rather than counted: the convention is applied to
 * names the user wrote, and seeing what each becomes is the only way to catch a
 * slug that came out wrong before the links are rewritten.
 */
export class ConfirmRenameModal extends Modal {
    private folder: TFolder;
    private plan: readonly PlannedRename[];
    private onConfirm: () => void;

    constructor(
        app: App,
        folder: TFolder,
        plan: readonly PlannedRename[],
        onConfirm: () => void,
    ) {
        super(app);
        this.folder = folder;
        this.plan = plan;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        const count = this.plan.length;
        const where = this.folder.isRoot() ? 'the vault root' : this.folder.path;

        contentEl.createEl('h3', {
            text: `Rename ${count} file${count === 1 ? '' : 's'} in ${where}?`,
        });

        const list = contentEl.createEl('ul', { cls: 'ronald-rename-plan' });
        for (const { from, to } of this.plan) {
            const item = list.createEl('li');
            item.createEl('code', { text: from });
            item.appendText(' → ');
            item.createEl('code', { text: to });
        }

        new Setting(contentEl)
            .addButton((button) =>
                button.setButtonText('Cancel').onClick(() => this.close()),
            )
            .addButton((button) =>
                button
                    .setButtonText('Rename')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onConfirm();
                    }),
            );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
