import { App, Modal, Setting, ToggleComponent } from 'obsidian';

/**
 * Pick the tags whose tasks go to the top.
 *
 * One toggle per tag. Keys 1–9 flip the matching toggle and Enter moves, so
 * the modal works without the mouse.
 */
export class TagPickerModal extends Modal {
    private tags: readonly string[];
    private onSubmit: (picked: string[]) => void;
    private picked = new Set<string>();

    constructor(app: App, tags: readonly string[], onSubmit: (picked: string[]) => void) {
        super(app);
        this.tags = tags;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        this.setTitle('Move tasks to top');

        const toggles: ToggleComponent[] = [];
        this.tags.forEach((tag, index) => {
            new Setting(contentEl)
                .setName(`#${tag}`)
                .setDesc(index < 9 ? `Press ${index + 1}` : '')
                .addToggle((toggle) => {
                    toggles.push(toggle);
                    toggle.onChange((on) => {
                        if (on) this.picked.add(tag);
                        else this.picked.delete(tag);
                    });
                });
        });

        toggles.slice(0, 9).forEach((toggle, index) => {
            this.scope.register([], String(index + 1), () => {
                toggle.setValue(!toggle.getValue());
                return false;
            });
        });

        this.scope.register([], 'Enter', () => {
            this.submit();
            return false;
        });

        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText('Move to top')
                .setCta()
                .onClick(() => this.submit()),
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /** Close and hand over the picked tags. */
    private submit(): void {
        if (this.picked.size === 0) return;
        this.close();
        this.onSubmit(this.tags.filter((tag) => this.picked.has(tag)));
    }
}
