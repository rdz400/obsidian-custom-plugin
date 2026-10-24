import {
    App,
    FuzzyMatch,
    FuzzySuggestModal,
    Notice,
    WorkspaceLeaf,
    renderResults,
    setIcon,
} from 'obsidian';

import { TabRecency } from '../shared/tabrecency';
import { leafFilePath, switchToTab } from '../shared/tabs';

/** An open tab plus what is shown for it. */
export interface TabItem {
    leaf: WorkspaceLeaf;
    /** The tab's title, as on the tab header. */
    title: string;
    /** The folder of the file the tab shows; '' for the vault root or no file. */
    folder: string;
    /** When the tab was last active, 0 when unknown. See `TabRecency`. */
    lastActive: number;
    /** True for the tab the user is in now. */
    current: boolean;
}

/** The folder part of `path`, '' when it sits in the vault root. */
function folderOf(path: string): string {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Every open tab in the main area and in popout windows, most recently used
 * first. Sidebar panes (file explorer, outline, …) are left out: they are not
 * tabs one switches between.
 *
 * Tabs with no known last use follow, alphabetically. The current tab goes
 * last, since switching to it would do nothing.
 */
export function collectTabs(app: App, recency: TabRecency): TabItem[] {
    const { workspace } = app;
    const active = workspace.getMostRecentLeaf(workspace.rootSplit);

    const items: TabItem[] = [];
    workspace.iterateAllLeaves((leaf) => {
        const root = leaf.getRoot();
        if (root === workspace.leftSplit || root === workspace.rightSplit) return;

        items.push({
            leaf,
            title: leaf.getDisplayText(),
            folder: folderOf(leafFilePath(leaf)),
            lastActive: recency.lastActive(leaf),
            current: leaf === active,
        });
    });

    return items.sort(
        (a, b) =>
            Number(a.current) - Number(b.current) ||
            b.lastActive - a.lastActive ||
            a.title.localeCompare(b.title),
    );
}

/**
 * Fuzzy search the open tabs. Choosing one switches to that tab — it never
 * opens the file anew.
 *
 * With an empty query the list is in `collectTabs` order. Once typing starts
 * it is ordered by match quality, and equally good matches keep that order.
 */
export class TabSwitcherModal extends FuzzySuggestModal<TabItem> {
    private readonly items: readonly TabItem[];

    constructor(app: App, items: readonly TabItem[]) {
        super(app);
        this.items = items;
        this.setPlaceholder('Search open tabs…');
        // Borrows the backlink search's row styling; see `styles.css`.
        this.modalEl.addClass('ronald-backlink-search');
    }

    getItems(): TabItem[] {
        return [...this.items];
    }

    getItemText(item: TabItem): string {
        return item.title;
    }

    renderSuggestion(match: FuzzyMatch<TabItem>, el: HTMLElement): void {
        const { item } = match;
        el.addClass('ronald-backlink-match');

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), item.leaf.getIcon());
        renderResults(title.createSpan(), item.title, match.match);
        if (item.current) {
            title.createSpan({ cls: 'ronald-backlink-type', text: 'current' });
        }

        if (item.folder) {
            el.createDiv({ cls: 'ronald-backlink-path', text: item.folder });
        }
    }

    onChooseItem(item: TabItem): void {
        void switchToTab(this.app, item.leaf);
    }
}

/** Show the open tabs in a modal and switch to the chosen one. */
export function showTabSwitcher(app: App, recency: TabRecency): void {
    const items = collectTabs(app, recency);
    if (items.length === 0) {
        new Notice('No tabs are open');
        return;
    }
    new TabSwitcherModal(app, items).open();
}
