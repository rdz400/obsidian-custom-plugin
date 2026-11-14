import { App, ButtonComponent, Keymap, Modal, Notice, Platform, TFile } from 'obsidian';

import { FilterBar, type FilterChip } from '../../shared/ui/filterbar';
import { GTD_NOTES, type GtdNote } from '../gtdnotes';
import type { TaskSettings } from '../settings';
import { addTaskLine } from './addtask';
import { findProject } from './findproject';
import { ProjectSuggest } from './projectsuggest';
import { parseEstimate, parseTags, taskLine } from './taskline';

/** What the modal starts with, from a link; every field is optional. */
export interface NewTaskPreset {
    text?: string;
    /** The GTD note to add to; inbox when not given. */
    note?: GtdNote['id'];
    /** Tags to switch on: a chip where there is one, the free field otherwise. */
    tags?: readonly string[];
    /** The project's name, as typed in the project field. */
    project?: string;
    /** The estimate in minutes, as typed in the estimate field. */
    estimate?: string;
}

/** The GTD note picked when the modal opens without one. */
const DEFAULT_NOTE: GtdNote['id'] = 'inbox';

/**
 * Open the "New task" modal, unless no GTD note is set to add to.
 *
 * `projects` lists the projects a task can link to; without it the modal has
 * no project field. It is read once, when the modal opens.
 */
export function newTask(
    app: App,
    settings: TaskSettings,
    projects?: () => TFile[],
    preset: NewTaskPreset = {},
): void {
    const notes = GTD_NOTES.filter((note) => app.vault.getFileByPath(settings[note.key]));
    if (notes.length === 0) {
        new Notice('Set the today, someday, overview or inbox note in settings first');
        return;
    }
    new NewTaskModal(app, settings, notes, projects?.(), preset).open();
}

/**
 * Add a task to the end of a GTD note.
 *
 * The task's text comes first, with the buttons on its row: on a phone the
 * keyboard covers the lower half of the screen, and the OS only keeps the
 * focused field in view (see the time record modal). Under it are the GTD
 * notes, the tag chips of the task search, and fields for other tags, a
 * project and an estimate.
 *
 * Enter adds the task and closes the modal; Mod+Enter, or the plus button,
 * adds it and clears the text for the next one, keeping the note, tags and
 * project. Alt+A/S/D/F picks the GTD note, the letters of "Switch to GTD
 * note"; Mod+1…9 toggles a tag chip, as in the task search.
 */
class NewTaskModal extends Modal {
    private note: GtdNote;
    private readonly noteEls = new Map<GtdNote['id'], HTMLElement>();
    private readonly tagChips: FilterChip[];
    private readonly tagBar: FilterBar;
    private textInput!: HTMLInputElement;
    private tagsInput!: HTMLInputElement;
    private projectInput: HTMLInputElement | undefined;
    private estimateInput!: HTMLInputElement;
    /** Set while a task is being written, so a second Enter doesn't add it twice. */
    private busy = false;

    constructor(
        app: App,
        private readonly settings: TaskSettings,
        private readonly notes: readonly GtdNote[],
        private readonly projects: readonly TFile[] | undefined,
        private readonly preset: NewTaskPreset,
    ) {
        super(app);
        this.note =
            notes.find((note) => note.id === preset.note) ??
            notes.find((note) => note.id === DEFAULT_NOTE) ??
            notes[0]!;
        this.tagChips = settings.taskFilterTags.filter((chip) => chip.value.length > 0);
        this.tagBar = new FilterBar({ chips: this.tagChips, onChange: () => {} });
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('ronald-new-task-modal');
        this.setTitle('New task');

        this.renderTextRow(contentEl.createDiv({ cls: 'ronald-new-task-row' }));
        this.renderNotes(contentEl.createDiv({ cls: 'ronald-task-filters ronald-new-task-notes' }));
        contentEl.appendChild(this.tagBar.el);
        keepFocus(this.tagBar.el);
        this.renderFields(contentEl.createDiv({ cls: 'ronald-new-task-row' }));
        if (!Platform.isMobile) this.renderHint(contentEl);

        this.applyPreset();
        this.registerKeys();

        // Focus after the modal has painted, or the open animation steals it.
        window.setTimeout(() => {
            this.textInput.focus();
            const end = this.textInput.value.length;
            this.textInput.setSelectionRange(end, end);
        }, 0);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderTextRow(row: HTMLElement): void {
        this.textInput = row.createEl('input', {
            type: 'text',
            cls: 'ronald-new-task-text',
            attr: { placeholder: 'What needs doing?', enterkeyhint: 'done' },
        });
        this.submitOnEnter(this.textInput);

        const mod = Platform.isMacOS ? 'Cmd' : 'Ctrl';
        const again = new ButtonComponent(row)
            .setIcon('list-plus')
            .setTooltip(`Add and start the next one (${mod}+Enter)`)
            .onClick(() => void this.submit(true));
        keepFocus(again.buttonEl);

        const add = new ButtonComponent(row)
            .setButtonText('Add')
            .setCta()
            .onClick(() => void this.submit(false));
        keepFocus(add.buttonEl);
    }

    /**
     * One chip per GTD note that is set, styled like the GTD chips of the task
     * search; exactly one is on.
     */
    private renderNotes(row: HTMLElement): void {
        const alt = Platform.isMacOS ? 'Option' : 'Alt';
        for (const note of this.notes) {
            const chip = row.createSpan({
                cls: 'ronald-task-filter ronald-task-filter-type-gtd',
                text: note.name,
                attr: {
                    'aria-keyshortcuts': `${alt}+${note.letter.toUpperCase()}`,
                    title: `${alt}+${note.letter.toUpperCase()}`,
                },
            });
            chip.addEventListener('click', () => this.selectNote(note));
            this.noteEls.set(note.id, chip);
        }
        keepFocus(row);
        this.selectNote(this.note);
    }

    private renderFields(row: HTMLElement): void {
        this.tagsInput = row.createEl('input', {
            type: 'text',
            cls: 'ronald-new-task-tags',
            attr: { placeholder: 'Other tags', autocapitalize: 'off', enterkeyhint: 'done' },
        });
        this.submitOnEnter(this.tagsInput);

        // Enter here is left to the suggestions, which use it to pick one.
        if (this.projects) {
            this.projectInput = row.createEl('input', {
                type: 'text',
                cls: 'ronald-new-task-project',
                attr: { placeholder: 'Project' },
            });
            new ProjectSuggest(this.app, this.projectInput, this.projects);
        }

        this.estimateInput = row.createEl('input', {
            type: 'text',
            cls: 'ronald-new-task-estimate',
            attr: { placeholder: 'Min', inputmode: 'numeric', enterkeyhint: 'done' },
        });
        this.submitOnEnter(this.estimateInput);
    }

    private renderHint(contentEl: HTMLElement): void {
        const mod = Platform.isMacOS ? 'Cmd' : 'Ctrl';
        const alt = Platform.isMacOS ? 'Option' : 'Alt';
        const letters = this.notes.map((note) => note.letter.toUpperCase()).join('/');
        contentEl.createDiv({
            cls: 'ronald-new-task-hint',
            text: `${alt}+${letters} note · ${mod}+1–9 tag · ${mod}+Enter add another`,
        });
    }

    private applyPreset(): void {
        const { text, tags, project, estimate } = this.preset;
        if (text) this.textInput.value = text;
        const others: string[] = [];
        for (const tag of tags ?? []) {
            if (this.tagChips.some((chip) => chip.value === tag)) {
                if (!this.tagBar.activeValues.has(tag)) this.tagBar.toggle(tag);
            } else {
                others.push(tag);
            }
        }
        this.tagsInput.value = others.join(' ');
        if (project && this.projectInput) this.projectInput.value = project;
        if (estimate) this.estimateInput.value = estimate;
    }

    /**
     * Mod+digit for the tag chips and Alt+letter for the GTD notes, wherever
     * focus is. Listened for in the capture phase so Obsidian's own Mod+digit
     * (switch tab, off macOS) never sees them.
     *
     * The letter is read off `code`: on macOS Option+A arrives as "å".
     */
    private registerKeys(): void {
        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                const note = this.noteForKey(event);
                if (note) this.selectNote(note);
                else if (!this.tagBar.handleKeyDown(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    private noteForKey(event: KeyboardEvent): GtdNote | undefined {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
        return this.notes.find((note) => event.code === `Key${note.letter.toUpperCase()}`);
    }

    private selectNote(note: GtdNote): void {
        this.note = note;
        for (const [id, el] of this.noteEls) el.toggleClass('is-active', id === note.id);
    }

    /** Enter adds the task and closes; Mod+Enter adds it and starts the next. */
    private submitOnEnter(input: HTMLInputElement): void {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            void this.submit(Keymap.isModifier(event, 'Mod'));
        });
    }

    /**
     * Add the task to the chosen GTD note. With `again`, the modal stays open
     * with the text and estimate cleared; the note, tags and project stay, as
     * the next task often shares them.
     */
    private async submit(again: boolean): Promise<void> {
        if (this.busy) return;
        const text = this.textInput.value.trim();
        if (text.length === 0) {
            this.textInput.focus();
            return;
        }

        const estimate = parseEstimate(this.estimateInput.value);
        if (estimate === null) {
            new Notice('Give the estimate in whole minutes, such as 20');
            this.estimateInput.focus();
            return;
        }

        const file = this.app.vault.getFileByPath(this.settings[this.note.key]);
        if (!file) {
            new Notice(`The ${this.note.name} note is gone; set it in settings`);
            return;
        }

        let projectLink: string | undefined;
        const projectName = this.projectInput?.value.trim() ?? '';
        if (projectName.length > 0) {
            const project = findProject(this.projects ?? [], projectName);
            if (!project) {
                new Notice(`No active project "${projectName}"`);
                this.projectInput?.focus();
                return;
            }
            projectLink = this.app.fileManager.generateMarkdownLink(project, file.path);
        }

        // Chips in their own order, so the tags read the same way every time.
        const active = this.tagBar.activeValues;
        const tags = [
            ...this.tagChips.filter((chip) => active.has(chip.value)).map((chip) => chip.value),
            ...parseTags(this.tagsInput.value),
        ];

        // Cleared before writing rather than after, so the next task can be
        // typed straight away without the write wiping it; put back if the
        // write fails and nothing new was typed meanwhile.
        const typedEstimate = this.estimateInput.value;
        if (again) {
            this.textInput.value = '';
            this.estimateInput.value = '';
            this.textInput.focus();
        }

        this.busy = true;
        const line = taskLine({ text, tags, projectLink, estimate });
        const added = await addTaskLine(this.app, file, this.note.name, line);
        this.busy = false;

        if (!added) {
            if (again && this.textInput.value.length === 0) {
                this.textInput.value = text;
                this.estimateInput.value = typedEstimate;
            }
            return;
        }
        if (!again) this.close();
    }
}

/**
 * Keep the focused field focused when `el` is pressed. Otherwise the press
 * blurs it first; on a phone the keyboard then slides away and the layout
 * shifts under the finger before the click lands.
 */
function keepFocus(el: HTMLElement): void {
    el.addEventListener('mousedown', (event) => event.preventDefault());
}
