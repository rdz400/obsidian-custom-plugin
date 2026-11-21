import { App, ButtonComponent, Keymap, Modal, Platform, setIcon, TextComponent } from 'obsidian';

import { FilterBar } from '../shared/ui/filterbar';
import { withTags } from './recordtags';
import { matchPastRecords, pastRecords, type PastRecord } from './suggestions';

/** What the time record modal is opened with. */
export interface TimeRecordModalOptions {
    /** The record's time, fixed when the command runs. */
    time: string;
    /** Tags offered as chips, lower case and without `#`. */
    tags: readonly string[];
    /** The texts of earlier records, the latest first, to suggest from. */
    loadPast: () => Promise<string[]>;
    /** Called with the record's text, chosen tags at the end. */
    onSubmit: (message: string) => void;
}

/**
 * Ask for the text of a time record.
 *
 * The time is fixed when the modal opens and only shown, not edited: the record
 * is meant to say when something happened, and that is the moment the command
 * was run, not the moment the text was finished.
 *
 * The layout is built around the phone keyboard, which comes up as soon as the
 * input is focused. The OS scrolls only the focused input into view, so
 * anything below it ends up behind the keyboard. That is why the **Add** button
 * shares the input's row, and why the suggestions are listed above it.
 *
 * While typing, earlier records that fit are suggested, the most used first.
 * None is picked by itself: Enter adds what was typed. Arrow keys pick one, and
 * Enter then adds that; Tab, or a tap, puts it in the field to change first;
 * Mod+Enter adds the first straight away. A suggestion brings its chips along.
 *
 * Under the input are the tag chips from settings, toggled with a tap or
 * Mod+1…9; the tags that are on go at the end of the line.
 */
export class TimeRecordModal extends Modal {
    private readonly tagBar: FilterBar;
    private input!: TextComponent;
    private listEl!: HTMLElement;
    private past: PastRecord[] = [];
    private matches: PastRecord[] = [];
    /** The suggestion picked with the arrow keys, or -1 for what was typed. */
    private selected = -1;

    constructor(app: App, private readonly options: TimeRecordModalOptions) {
        super(app);
        this.tagBar = new FilterBar({
            chips: options.tags.map((value) => ({ value, type: 'other' })),
            onChange: () => {},
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('ronald-time-record-modal');
        this.setTitle('Add time record');

        const timeRow = contentEl.createDiv({ cls: 'ronald-time-record-row' });
        setIcon(timeRow.createSpan({ cls: 'ronald-time-record-icon' }), 'clock');
        timeRow.createSpan({ cls: 'ronald-time-record-time', text: this.options.time });

        this.listEl = contentEl.createDiv({
            cls: 'ronald-time-record-suggestions',
            attr: { role: 'listbox' },
        });
        this.listEl.hidden = true;
        keepFocus(this.listEl);

        this.renderMessageRow(contentEl.createDiv({ cls: 'ronald-time-record-row' }));

        if (this.options.tags.length > 0) {
            contentEl.appendChild(this.tagBar.el);
            keepFocus(this.tagBar.el);
        }
        if (!Platform.isMobile) this.renderHint(contentEl);
        this.registerChipKeys();

        void this.loadPast();

        // Focus after the modal has painted, or the open animation steals it.
        window.setTimeout(() => this.input.inputEl.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderMessageRow(row: HTMLElement): void {
        setIcon(row.createSpan({ cls: 'ronald-time-record-icon' }), 'message-square');

        this.input = new TextComponent(row).setPlaceholder('What happened?');
        const { inputEl } = this.input;
        inputEl.addClass('ronald-time-record-input');
        // Label the keyboard's return key; Enter submits, same as the button.
        inputEl.enterKeyHint = 'done';
        inputEl.addEventListener('input', () => this.refresh());
        inputEl.addEventListener('keydown', (event) => this.onKeyDown(event));

        const button = new ButtonComponent(row)
            .setButtonText('Add')
            .setCta()
            .onClick(() => this.submit());
        keepFocus(button.buttonEl);
    }

    private renderHint(contentEl: HTMLElement): void {
        const mod = Platform.isMacOS ? 'Cmd' : 'Ctrl';
        const parts = ['↑↓ pick', 'Tab fill in', `${mod}+Enter add first`];
        if (this.options.tags.length > 0) parts.push(`${mod}+1–9 tag`);
        contentEl.createDiv({ cls: 'ronald-time-record-hint', text: parts.join(' · ') });
    }

    /**
     * Mod+digit toggles a chip wherever focus is. Listened for in the capture
     * phase so Obsidian's own Mod+digit (switch tab, off macOS) never sees it.
     */
    private registerChipKeys(): void {
        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!this.tagBar.handleKeyDown(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    /** Read the earlier records; until then nothing is suggested. */
    private async loadPast(): Promise<void> {
        const texts = await this.options.loadPast();
        this.past = pastRecords(texts, new Set(this.options.tags));
        this.refresh();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.isComposing) return;
        const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
        const hasMatches = this.matches.length > 0;

        if (plain && hasMatches && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            this.move(event.key === 'ArrowDown' ? 1 : -1);
        } else if (plain && hasMatches && event.key === 'Tab') {
            event.preventDefault();
            this.fill(this.matches[Math.max(this.selected, 0)]!);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const first = Keymap.isModifier(event, 'Mod') ? Math.max(this.selected, 0) : this.selected;
            const record = this.matches[first];
            if (record) this.fill(record);
            this.submit();
        }
    }

    /** Step through the suggestions, with what was typed before the first and after the last. */
    private move(step: number): void {
        const slots = this.matches.length + 1;
        this.selected = ((this.selected + 1 + step + slots) % slots) - 1;
        this.renderList();
    }

    /** Put a suggestion in the field and switch on its chips; the list closes until the next key. */
    private fill(record: PastRecord): void {
        this.input.setValue(record.text);
        for (const tag of record.tags) {
            if (!this.tagBar.activeValues.has(tag)) this.tagBar.toggle(tag);
        }
        this.matches = [];
        this.selected = -1;
        this.renderList();
        const end = record.text.length;
        this.input.inputEl.setSelectionRange(end, end);
    }

    /** Match the typed text again; nothing is picked after a change. */
    private refresh(): void {
        this.matches = matchPastRecords(this.past, this.input.getValue());
        this.selected = -1;
        this.renderList();
    }

    private renderList(): void {
        this.listEl.empty();
        this.listEl.hidden = this.matches.length === 0;
        this.matches.forEach((record, index) => {
            const row = this.listEl.createDiv({
                cls: 'ronald-time-record-suggestion',
                attr: { role: 'option', 'aria-selected': String(index === this.selected) },
            });
            row.toggleClass('is-selected', index === this.selected);
            row.createSpan({ cls: 'ronald-time-record-suggestion-text', text: record.label });
            if (record.tags.length > 0) {
                row.createSpan({
                    cls: 'ronald-time-record-suggestion-tags',
                    text: record.tags.map((tag) => `#${tag}`).join(' '),
                });
            }
            row.addEventListener('click', () => this.fill(record));
        });
    }

    /** Add what is in the field, with the chips that are on in their own order. */
    private submit(): void {
        const text = this.input.getValue().trim();
        if (text.length === 0) return;
        const active = this.tagBar.activeValues;
        const tags = this.options.tags.filter((tag) => active.has(tag));
        this.close();
        this.options.onSubmit(withTags(text, tags));
    }
}

/**
 * Keep the input focused when `el` is pressed.
 *
 * Otherwise the press blurs the input first; on a phone the keyboard then
 * slides away and the layout shifts under the finger before the click lands.
 */
function keepFocus(el: HTMLElement): void {
    el.addEventListener('mousedown', (event) => event.preventDefault());
}
