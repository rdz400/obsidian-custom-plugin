import { App, ButtonComponent, Modal, setIcon, TextComponent } from 'obsidian';

/**
 * Ask for the text of a time record: typed, or picked from the common events
 * in the settings.
 *
 * The time is fixed when the modal opens and only shown, not edited: the record
 * is meant to say when something happened, and that is the moment the command
 * was run, not the moment the text was finished.
 *
 * The layout is built around the phone keyboard, which comes up as soon as the
 * input is focused. The OS scrolls only the focused input into view, so
 * anything below it ends up behind the keyboard. That is why the **Add** button
 * shares the input's row and the event chips sit above the input, not below.
 */
export class TimeRecordModal extends Modal {
    private time: string;
    private events: string[];
    private onSubmit: (message: string) => void;

    constructor(
        app: App,
        time: string,
        events: string[],
        onSubmit: (message: string) => void,
    ) {
        super(app);
        this.time = time;
        // Blank rows are what "Add event" leaves until something is typed.
        this.events = events.filter((event) => event.length > 0);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('ronald-time-record-modal');
        this.setTitle('Add time record');

        const submit = (message: string) => {
            const trimmed = message.trim();
            if (trimmed.length === 0) return;
            this.close();
            this.onSubmit(trimmed);
        };

        const timeRow = contentEl.createDiv({ cls: 'ronald-time-record-row' });
        setIcon(timeRow.createSpan({ cls: 'ronald-time-record-icon' }), 'clock');
        timeRow.createSpan({ cls: 'ronald-time-record-time', text: this.time });

        const chipsEl = contentEl.createDiv({ cls: 'ronald-time-record-events' });
        const chips = this.events.map((event) => {
            const chip = chipsEl.createEl('button', {
                cls: 'ronald-time-record-event',
                text: event,
            });
            keepFocus(chip);
            chip.addEventListener('click', () => submit(event));
            return { event, chip };
        });
        if (chips.length === 0) chipsEl.hide();

        const messageRow = contentEl.createDiv({ cls: 'ronald-time-record-row' });
        setIcon(
            messageRow.createSpan({ cls: 'ronald-time-record-icon' }),
            'message-square',
        );

        const input = new TextComponent(messageRow).setPlaceholder(
            chips.length > 0 ? 'Type or pick an event' : 'What happened?',
        );
        input.inputEl.addClass('ronald-time-record-input');
        // Label the keyboard's return key; Enter submits, same as the button.
        input.inputEl.enterKeyHint = 'done';

        // Typing narrows the chips to the events that contain the text, so a
        // long list shrinks to the few that fit while the keyboard is up.
        input.onChange((value) => {
            const query = value.trim().toLowerCase();
            let shown = 0;
            for (const { event, chip } of chips) {
                const matches = event.toLowerCase().includes(query);
                chip.toggle(matches);
                if (matches) shown++;
            }
            chipsEl.toggle(shown > 0);
        });

        input.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                submit(input.getValue());
            }
        });

        const button = new ButtonComponent(messageRow)
            .setButtonText('Add')
            .setCta()
            .onClick(() => submit(input.getValue()));
        keepFocus(button.buttonEl);

        // Focus after the modal has painted, or the open animation steals it.
        window.setTimeout(() => input.inputEl.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
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
