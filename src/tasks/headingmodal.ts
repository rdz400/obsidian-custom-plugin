import { App, Editor, HeadingCache, Notice, Platform, SuggestModal, TFile, setIcon } from 'obsidian';

import { freshCache } from '../shared/editor/freshcache';
import { replaceChanged, restoreCursor, selectedLineRange } from '../shared/editor/lines';
import { moveUnderHeading } from './headingmove';

/** The keys that, with Alt, pick the first nine headings: the home row. */
const KEYS = 'asdfghjkl';

/** How deep a heading may sit before it stops being indented any further. */
const MAX_INDENT_LEVEL = 6;

/** A heading to move under, and the key that picks it, if it has one. */
interface Target {
    heading: HeadingCache;
    key?: string;
}

/**
 * Pick the heading to move the selected list items under. The note's headings
 * are listed in order and indented by level, as in the outline; typing narrows
 * them, Enter or a tap picks one, and Alt with a home row key picks one of the
 * first nine straight away. A heading keeps its key while the list is narrowed.
 */
class HeadingMoveModal extends SuggestModal<Target> {
    private readonly targets: Target[];

    constructor(
        app: App,
        headings: HeadingCache[],
        private readonly onPick: (heading: HeadingCache) => void,
    ) {
        super(app);
        this.targets = headings.map((heading, i) => ({ heading, key: KEYS[i] }));
        this.setPlaceholder('Move under heading…');
        // Borrows the outline's indented rows; see `styles.css`.
        this.modalEl.addClass('ronald-backlink-search', 'ronald-outline');
        const alt = Platform.isMacOS ? 'Option' : 'Alt';
        this.setInstructions([
            { command: `${alt}+letter`, purpose: 'to move under that heading' },
            { command: '↵', purpose: 'to move under the selected heading' },
        ]);
        this.registerKeys();
    }

    /**
     * Listened for in the capture phase, before the search field takes the
     * key. The letter is read off `code`: on macOS Option+A arrives as "å".
     */
    private registerKeys(): void {
        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                const target = this.targets.find(
                    (t) => t.key !== undefined && event.code === `Key${t.key.toUpperCase()}`,
                );
                if (!target) return;
                event.preventDefault();
                event.stopPropagation();
                this.close();
                this.onPick(target.heading);
            },
            { capture: true },
        );
    }

    getSuggestions(query: string): Target[] {
        const q = query.toLowerCase();
        return this.targets.filter((t) => t.heading.heading.toLowerCase().includes(q));
    }

    renderSuggestion(target: Target, el: HTMLElement): void {
        const { heading, level } = target.heading;
        el.addClass('ronald-backlink-match');
        el.setAttr('data-level', String(Math.min(level, MAX_INDENT_LEVEL)));

        const title = el.createDiv({ cls: 'ronald-backlink-title' });
        setIcon(title.createSpan({ cls: 'ronald-backlink-icon' }), `heading-${level}`);
        title.createSpan({ cls: 'ronald-outline-heading', text: heading });
        if (target.key !== undefined) {
            title.createEl('kbd', { cls: 'ronald-heading-key', text: target.key.toUpperCase() });
        }
    }

    onChooseSuggestion(target: Target): void {
        this.onPick(target.heading);
    }
}

/**
 * Ask for a heading in `file` and move the list items the selection touches,
 * with their subitems, to the end of its section, in one edit so a single undo
 * puts them back. The cursor stays on the line it was on.
 */
export async function moveLinesToHeading(app: App, file: TFile, editor: Editor): Promise<void> {
    // Taken before waiting, so moving the cursor meanwhile doesn't change what moves.
    const { from, to } = selectedLineRange(editor);
    const origin = editor.getCursor('from');

    // The line numbers must come from a cache of what the editor shows.
    const text = editor.getValue();
    const cache = await freshCache(app, file, text);
    if (!cache || editor.getValue() !== text) {
        new Notice('Note changed while moving; try again');
        return;
    }

    const headings = cache.headings ?? [];
    if (headings.length === 0) {
        new Notice(`"${file.basename}" has no headings`);
        return;
    }
    // Checked before asking, so the modal never opens for nothing to move.
    if (moveUnderHeading(text, cache, from, to, headings[0]!.position.start.line) === undefined) {
        new Notice('No bullets or tasks selected');
        return;
    }

    new HeadingMoveModal(app, headings, (heading) => {
        if (editor.getValue() !== text) {
            new Notice('Note changed while moving; try again');
            return;
        }
        const next = moveUnderHeading(text, cache, from, to, heading.position.start.line);
        if (next === undefined || next === text) return;
        replaceChanged(editor, next);
        restoreCursor(editor, origin);
    }).open();
}
