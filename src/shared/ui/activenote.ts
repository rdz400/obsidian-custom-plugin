import { MarkdownView, type Plugin, type TFile, debounce } from 'obsidian';

/** The note in the active tab, with its text as the tab shows it. */
export interface ActiveNote {
    file: TFile;
    text: string;
}

/**
 * Draws one status bar item for the active note, or for no note at all —
 * another kind of view is active. Called again whenever either changes.
 */
export type ActiveNoteRenderer = (el: HTMLElement, note: ActiveNote | null) => void;

/** How long typing has to pause before the item is redrawn. */
const REDRAW_DELAY_MS = 300;

/**
 * Add a status bar item that `render` keeps in step with the active note.
 *
 * The text is taken from the view rather than the disk, so unsaved edits
 * count. It is redrawn when another tab or note becomes active, while typing,
 * and when the note changes on disk — which covers reading mode and edits made
 * from elsewhere, such as tasks moved in by a command.
 */
export function addActiveNoteStatus(plugin: Plugin, render: ActiveNoteRenderer): void {
    const el = plugin.addStatusBarItem();
    const { workspace, metadataCache } = plugin.app;

    const redraw = () => {
        const view = workspace.getActiveViewOfType(MarkdownView);
        render(el, view?.file ? { file: view.file, text: view.getViewData() } : null);
    };
    const redrawSoon = debounce(redraw, REDRAW_DELAY_MS, true);

    workspace.onLayoutReady(redraw);
    plugin.registerEvent(workspace.on('active-leaf-change', redraw));
    plugin.registerEvent(workspace.on('file-open', redraw));
    plugin.registerEvent(workspace.on('editor-change', redrawSoon));
    plugin.registerEvent(
        metadataCache.on('changed', (file) => {
            if (file === workspace.getActiveFile()) redrawSoon();
        }),
    );
}
