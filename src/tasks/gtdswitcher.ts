import { App, Notice, Platform, SuggestModal, TFile, WorkspaceLeaf } from 'obsidian';

import { GTD_NOTES } from './gtdnotes';
import type { TaskSettings } from './settings';
import { TabRecency } from '../shared/tabrecency';
import { leafFilePath, switchToTab } from '../shared/tabs';

/** A GTD note that is set in settings and exists, plus its shortcut digit. */
interface GtdItem {
    name: string;
    file: TFile;
    /** Its place in `GTD_NOTES`, from 1, so Mod+digit stays the same per note. */
    digit: number;
}

/**
 * The GTD notes that are set and exist, in `GTD_NOTES` order.
 *
 * Digits follow `GTD_NOTES` rather than this list, so an unset note leaves a
 * gap instead of shifting the shortcuts of the ones after it.
 */
function collectGtdNotes(app: App, settings: TaskSettings): GtdItem[] {
    return GTD_NOTES.flatMap((note, i) => {
        const file = app.vault.getFileByPath(settings[note.key]);
        return file ? [{ name: note.name, file, digit: i + 1 }] : [];
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

/** How Mod+`digit` is written on this platform. */
function shortcutLabel(digit: number): string {
    return Platform.isMacOS ? `⌘${digit}` : `Ctrl+${digit}`;
}

/**
 * Pick a GTD note to go to. Mod+digit goes straight to the note with that
 * digit, so one hotkey for the modal stands in for one hotkey per note.
 */
class GtdSwitcherModal extends SuggestModal<GtdItem> {
    constructor(
        app: App,
        private readonly items: readonly GtdItem[],
        private readonly recency: TabRecency,
    ) {
        super(app);
        this.setPlaceholder('Go to note…');
        this.setInstructions([
            { command: '↵', purpose: 'to go to note' },
            { command: shortcutLabel(1).replace('1', '1…'), purpose: 'to go to that note' },
        ]);
        for (const item of items) {
            // Bound on the modal's scope, so it wins over Obsidian's own
            // Mod+digit tab switching while the modal is open.
            this.scope.register(['Mod'], String(item.digit), () => {
                this.close();
                void goToNote(this.app, item.file, this.recency);
                return false;
            });
        }
    }

    getSuggestions(query: string): GtdItem[] {
        const q = query.toLowerCase();
        return this.items.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.file.basename.toLowerCase().includes(q),
        );
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
            text: shortcutLabel(item.digit),
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
