import { App, OpenViewState, SuggestModal, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * True when `event` asks for the file to open in a new tab.
 *
 * That is the platform's own command key — Cmd on macOS, Ctrl elsewhere —
 * matching how Obsidian itself treats a modified click or Enter on a link. A
 * middle click means the same thing for a mouse.
 */
export function wantsNewTab(event?: MouseEvent | KeyboardEvent): boolean {
    if (!event) return false;
    if (event instanceof MouseEvent && event.button === 1) return true;
    return event.metaKey || event.ctrlKey;
}

/**
 * The leaf a chosen file should open in.
 *
 * Without a modifier it reuses the tab the user was last in, so the search
 * behaves like following a link: `getMostRecentLeaf` is scoped to `rootSplit`
 * so a sidebar the user last touched never gets the note pushed into it. With
 * one, a fresh tab is made and the note that was open stays where it is.
 */
function targetLeaf(app: App, newTab: boolean): WorkspaceLeaf {
    if (newTab) return app.workspace.getLeaf('tab');
    return (
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ??
        app.workspace.getLeaf(false)
    );
}

/**
 * Open `file`, in a new tab when `event` carries the command modifier and in
 * the active tab otherwise.
 *
 * `state` carries anything the caller wants the view to restore, such as the
 * line to put the cursor on.
 */
export function openFileFromSearch(
    app: App,
    file: TFile,
    event?: MouseEvent | KeyboardEvent,
    state?: OpenViewState,
): void {
    void targetLeaf(app, wantsNewTab(event)).openFile(file, state);
}

/**
 * Make Mod+Enter choose the highlighted suggestion, so `onChooseSuggestion`
 * runs with a modified event and can open in a new tab.
 *
 * A `SuggestModal` only binds plain Enter itself, and Obsidian's own Mod+Enter
 * would otherwise reach the app behind the modal. Returning false tells the
 * keymap the press was consumed.
 */
export function registerNewTabEnter<T>(modal: SuggestModal<T>): void {
    modal.scope.register(['Mod'], 'Enter', (event) => {
        modal.selectActiveSuggestion(event);
        return false;
    });
}

/**
 * True when `event` asks for an alternate action tied to Alt — Option on
 * macOS — rather than the default one.
 */
export function wantsAltAction(event?: MouseEvent | KeyboardEvent): boolean {
    return event?.altKey ?? false;
}

/**
 * Make Alt+Enter (Option+Enter on macOS) choose the highlighted suggestion,
 * so `onChooseSuggestion` runs with a modified event and can branch on
 * `wantsAltAction`. See `registerNewTabEnter` for why this is bound on the
 * modal's scope rather than left to Obsidian's own keymap.
 */
export function registerAltEnter<T>(modal: SuggestModal<T>): void {
    modal.scope.register(['Alt'], 'Enter', (event) => {
        modal.selectActiveSuggestion(event);
        return false;
    });
}

/**
 * True when `event` asks for the secondary action tied to Shift rather than
 * the default one.
 */
export function wantsShiftAction(event?: MouseEvent | KeyboardEvent): boolean {
    return event?.shiftKey ?? false;
}

/**
 * Make Shift+Enter choose the highlighted suggestion, so `onChooseSuggestion`
 * runs with a modified event and can branch on `wantsShiftAction`. See
 * `registerNewTabEnter` for why this is bound on the modal's scope rather than
 * left to Obsidian's own keymap.
 */
export function registerShiftEnter<T>(modal: SuggestModal<T>): void {
    modal.scope.register(['Shift'], 'Enter', (event) => {
        modal.selectActiveSuggestion(event);
        return false;
    });
}

/** How long a touch must be held before it counts as a long press. */
const LONG_PRESS_MS = 500;

/** How far a touch may drift and still count as a press rather than a scroll. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * Make a long press on a suggestion do what Shift+Enter does, for touch devices
 * where no modifier key can be held.
 *
 * The press is turned into a synthetic shift-flagged `click` on the row, so it
 * travels the same path a real click does and reaches `onChooseSuggestion` as a
 * `MouseEvent` that `wantsShiftAction` recognises. Nothing else has to know a
 * touch was involved: a modal that branches on the shift modifier gets the
 * gesture for free, and one that doesn't is unaffected.
 *
 * The listener is delegated from the result container rather than bound per row,
 * so it survives the list being rebuilt on every keystroke.
 *
 * A press is abandoned when the finger drifts more than `LONG_PRESS_SLOP_PX`,
 * so scrolling the results never fires it, and the timer is cleared on `touchend`
 * and `touchcancel` so a quick tap stays an ordinary open.
 */
export function registerLongPressShift<T>(modal: SuggestModal<T>): void {
    const container = modal.resultContainerEl;
    let timer: number | undefined;
    let startX = 0;
    let startY = 0;

    const cancel = (): void => {
        if (timer === undefined) return;
        window.clearTimeout(timer);
        timer = undefined;
    };

    container.addEventListener(
        'touchstart',
        (event) => {
            cancel();

            const touch = event.touches[0];
            // Only a single-finger press is a long press; a second finger means
            // a pinch or scroll gesture the list should keep for itself.
            if (!touch || event.touches.length !== 1) return;

            const row = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                '.suggestion-item',
            );
            if (!row) return;

            startX = touch.clientX;
            startY = touch.clientY;

            timer = window.setTimeout(() => {
                timer = undefined;
                row.dispatchEvent(
                    new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        shiftKey: true,
                    }),
                );
            }, LONG_PRESS_MS);
        },
        // Passive: the handler never calls `preventDefault`, so the list keeps
        // scrolling at full speed while a press is being timed.
        { passive: true },
    );

    container.addEventListener(
        'touchmove',
        (event) => {
            const touch = event.touches[0];
            if (!touch) return;

            const moved =
                Math.abs(touch.clientX - startX) > LONG_PRESS_SLOP_PX ||
                Math.abs(touch.clientY - startY) > LONG_PRESS_SLOP_PX;
            if (moved) cancel();
        },
        { passive: true },
    );

    container.addEventListener('touchend', cancel, { passive: true });
    container.addEventListener('touchcancel', cancel, { passive: true });
}
