import { App, Modal, Setting } from 'obsidian';

/** What to do with the pending changes when the manager is closed. */
export type CloseChoice = 'apply' | 'discard';

/**
 * Ask what to do with pending changes before the task manager closes:
 * "Keep editing" goes back to it, "Discard" closes without writing, "Apply"
 * writes and then closes. Closing this modal any other way keeps editing.
 */
export class ConfirmCloseModal extends Modal {
    private readonly count: number;
    private readonly onChoose: (choice: CloseChoice) => void;

    constructor(app: App, count: number, onChoose: (choice: CloseChoice) => void) {
        super(app);
        this.count = count;
        this.onChoose = onChoose;
    }

    onOpen(): void {
        this.setTitle(`Apply ${this.count} ${this.count === 1 ? 'change' : 'changes'}?`);
        const choose = (choice: CloseChoice) => {
            this.close();
            this.onChoose(choice);
        };
        new Setting(this.contentEl)
            .addButton((button) => button.setButtonText('Keep editing').onClick(() => this.close()))
            .addButton((button) => button.setButtonText('Discard').setDestructive().onClick(() => choose('discard')))
            .addButton((button) => button.setButtonText('Apply').setCta().onClick(() => choose('apply')));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
