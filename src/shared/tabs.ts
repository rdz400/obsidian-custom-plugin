import type { App, WorkspaceLeaf } from 'obsidian';

/**
 * The path of the file `leaf` shows, or '' when it shows none.
 *
 * Read from the view state rather than `view.file`, because a background tab
 * is deferred and has no file view loaded yet — its state still names the file.
 */
export function leafFilePath(leaf: WorkspaceLeaf): string {
    const file: unknown = leaf.getViewState().state?.file;
    return typeof file === 'string' ? file : '';
}

/**
 * Make `leaf` the active tab: bring its window and tab group forward, load it
 * if it was deferred, and put the cursor in it.
 */
export async function switchToTab(app: App, leaf: WorkspaceLeaf): Promise<void> {
    await app.workspace.revealLeaf(leaf);
    app.workspace.setActiveLeaf(leaf, { focus: true });
}
