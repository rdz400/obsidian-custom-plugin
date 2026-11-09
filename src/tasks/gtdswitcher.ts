import { App, Notice, SuggestModal, TFile, WorkspaceLeaf } from 'obsidian';

import { GTD_NOTES, type GtdNote } from './gtdnotes';
import type { TaskSettings } from './settings';
import { TabRecency } from '../shared/tabrecency';
import { leafFilePath, switchToTab } from '../shared/tabs';

/** The key that opens each GTD note in the switcher, all on the home row. */
const KEYS: Record<GtdNote['id'], string> = { today: 'a', someday: 's', overview: 'd', inbox: 'f' };

/** A GTD note that is set in settings and exists, plus the key that opens it. */
interface GtdItem {
    name: string;
    file: TFile;
    /** The key that opens it in the switcher. */
    key: string;
}

/**
 * The GTD notes that are set and exist, in `GTD_NOTES` order.
 *
 * Keys follow `GTD_NOTES` rather than this list, so an unset note leaves a
 * gap instead of shifting the keys of the ones after it.
 */
function collectGtdNotes(app: App, settings: TaskSettings): GtdItem[] {
    return GTD_NOTES.flatMap((note) => {
        const file = app.vault.getFileByPath(settings[note.key]);
        return file ? [{ name: note.name, file, key: KEYS[note.id] }] : [];
    });
}

/**
 * The tab in the main area or a popout window that shows `file`, the most
 * recently used one when there are several; null when none does.
 */
function tabShowing(app: App, file: TFile, recency: TabRecency): WorkspaceLeaf | null {
    const { workspace } = app;
    let found: WorkspaceLeaf | null = null;
    workspace.iterateAllLeaves((leaf) => {
        const root = leaf.getRoot();
        if (root === workspace.leftSplit || root === workspace.rightSplit) return;
        if (leafFilePath(leaf) !== file.path) return;
        if (!found || recency.lastActive(leaf) > recency.lastActive(found)) found = leaf;
    });
    return found;
}

/**
 * Go to the tab that already shows `file`, or open it in the tab the user was
 * last in when no tab does.
 */
async function goToNote(app: App, file: TFile, recency: TabRecency): Promise<void> {
    const open = tabShowing(app, file, recency);
    if (open) {
        await switchToTab(app, open);
        return;
    }
    const leaf =
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ??
        app.workspace.getLeaf(false);
    await leaf.openFile(file);
}

/**
 * Pick a GTD note to go to. With only a handful of notes there is nothing to
 * search, so the search field is hidden: a, s, d or f goes straight to its
 * note, and the arrow keys with Enter, or a tap, work too.
 */
class GtdSwitcherModal extends SuggestModal<GtdItem> {
    constructor(
        app: App,
        private readonly items: readonly GtdItem[],
        private readonly recency: TabRecency,
    ) {
        super(app);
        // Hidden rather than removed: SuggestModal still reads it.
        this.inputEl.parentElement?.hide();
        this.setInstructions([{ command: Object.values(KEYS).join(' '), purpose: 'to go to that note' }]);
        for (const item of items) {
            this.scope.register([], item.key, () => {
                this.close();
                void goToNote(this.app, item.file, this.recency);
                return false;
            });
        }
    }

    getSuggestions(): GtdItem[] {
        return [...this.items];
    }

    renderSuggestion(item: GtdItem, el: HTMLElement): void {
        el.addClass('mod-complex');
        const content = el.createDiv({ cls: 'suggestion-content' });
        content.createDiv({ cls: 'suggestion-title', text: item.name });
        if (item.file.basename !== item.name) {
            content.createDiv({ cls: 'suggestion-note', text: item.file.basename });
        }
        el.createDiv({ cls: 'suggestion-aux' }).createEl('kbd', {
            cls: 'suggestion-hotkey',
            text: item.key.toUpperCase(),
        });
    }

    onChooseSuggestion(item: GtdItem): void {
        void goToNote(this.app, item.file, this.recency);
    }
}

/** Go to the GTD note with `id`, the one set in settings, like the switcher does. */
export async function goToGtdNote(
    app: App,
    settings: TaskSettings,
    recency: TabRecency,
    id: (typeof GTD_NOTES)[number]['id'],
): Promise<void> {
    const note = GTD_NOTES.find((n) => n.id === id);
    const file = note && app.vault.getFileByPath(settings[note.key]);
    if (!file) {
        new Notice(`Set the ${id} note in settings first`);
        return;
    }
    await goToNote(app, file, recency);
}

/** Show the GTD notes in a modal and go to the chosen one. */
export function showGtdSwitcher(
    app: App,
    settings: TaskSettings,
    recency: TabRecency,
): void {
    const items = collectGtdNotes(app, settings);
    if (items.length === 0) {
        new Notice('Set the today, someday, overview or inbox note in settings first');
        return;
    }
    new GtdSwitcherModal(app, items, recency).open();
}
