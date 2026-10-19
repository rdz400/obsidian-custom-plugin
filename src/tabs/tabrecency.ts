import { Plugin, WorkspaceLeaf } from 'obsidian';

/**
 * Remembers when each tab was last made active, so the tab switcher can list
 * the most recently used tabs first.
 *
 * Obsidian keeps a timestamp of its own on every leaf (`activeTime`), but it
 * is not part of the public API, so it is only read as a fallback: it is what
 * gives tabs used before the plugin loaded — or before a plugin reload — a
 * place in the order. Times recorded here win when both are known.
 *
 * The map is weak, so a closed tab's entry goes away with the leaf.
 */
export class TabRecency {
    private readonly activated = new WeakMap<WorkspaceLeaf, number>();

    /** Start recording, for as long as `plugin` stays loaded. */
    register(plugin: Plugin): void {
        const workspace = plugin.app.workspace;
        // The tab that is active at load counts as just used.
        const current = workspace.getMostRecentLeaf(workspace.rootSplit);
        if (current) this.activated.set(current, Date.now());

        plugin.registerEvent(
            workspace.on('active-leaf-change', (leaf) => {
                if (leaf) this.activated.set(leaf, Date.now());
            }),
        );
    }

    /** When `leaf` was last active, in ms since the epoch; 0 when unknown. */
    lastActive(leaf: WorkspaceLeaf): number {
        const tracked = this.activated.get(leaf) ?? 0;
        const internal = (leaf as { activeTime?: unknown }).activeTime;
        return Math.max(tracked, typeof internal === 'number' ? internal : 0);
    }
}
