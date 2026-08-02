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
