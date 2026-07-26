import { Platform, setIcon } from 'obsidian';

/** The bits of a SuggestModal this helper touches. */
interface DismissableModal {
    modalEl: HTMLElement;
    inputEl: HTMLInputElement;
}

/**
 * Add a button that forces the on-screen keyboard down, in the top corner of
 * the modal.
 *
 * Only mobile gets it: on desktop there is no software keyboard to hide.
 *
 * Suggest modals have no close cross of their own (Obsidian dismisses them by
 * tapping outside), so the button is placed against the prompt's own corner and
 * the search field is given room for it in `styles.css`.
 *
 * Blurring the input alone is not enough on iOS — Safari keeps the keyboard up
 * whenever it thinks focus may return to a text field, and Obsidian's suggest
 * modals refocus their input on interaction. Marking the input `readonly`
 * before blurring makes it uneditable, which is what actually retracts the
 * keyboard; the flag is dropped again as soon as the user taps the field, so
 * typing keeps working and the keyboard comes back on demand.
 */
export function addKeyboardDismissButton(modal: DismissableModal): void {
    if (!Platform.isMobile) return;

    const { modalEl, inputEl } = modal;
    const button = createDiv({ cls: 'ronald-keyboard-dismiss', attr: { 'aria-label': 'Hide keyboard' } });
    setIcon(button, 'keyboard-off');

    // Ahead of the close cross where there is one (a plain Modal), otherwise
    // simply first in the prompt (a SuggestModal, which has none).
    const close = modalEl.querySelector('.modal-close-button');
    if (close) close.insertAdjacentElement('beforebegin', button);
    else modalEl.prepend(button);

    // `mousedown` would move focus to the button first, which on iOS counts as
    // leaving the field and re-showing the keyboard on the way back.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        inputEl.readOnly = true;
        inputEl.blur();
    });

    // Tapping the field undoes the above, so hiding the keyboard never leaves
    // the search box stuck as uneditable.
    const restore = () => {
        if (!inputEl.readOnly) return;
        inputEl.readOnly = false;
        // Focus is refused while readonly, so ask for it again now.
        inputEl.focus();
    };
    inputEl.addEventListener('touchstart', restore, { passive: true });
    inputEl.addEventListener('click', restore);
}
