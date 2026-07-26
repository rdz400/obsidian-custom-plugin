import { Platform } from 'obsidian';

/** Modifier used for the tag shortcuts, so the hint matches the platform. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';

/** How many chips can be reached by a shortcut: Mod+1 … Mod+9. */
const MAX_SHORTCUTS = 9;

/**
 * One filter chip: the tag it toggles, and the "type" it belongs to.
 *
 * The type is purely presentational (see `renderChip`) so callers can group
 * chips like "buiten"/"thuis" (context) apart from "vandaag"/"week" (time)
 * without the bar needing to know what the types mean.
 */
export interface FilterTag {
    tag: string;
    type: string;
}

/** Everything the bar needs to know about the world it is placed in. */
export interface TagFilterBarOptions {
    /** The chips offered, in the order they are shown and numbered. */
    tags: readonly FilterTag[];
    /** Called after every change, with the tags that are now active. */
    onChange: (active: ReadonlySet<string>) => void;
}

/**
 * A row of toggleable tag chips.
 *
 * The bar owns nothing but its own element and selection: it never touches the
 * modal it is dropped into, and reports changes through `onChange` only. That
 * keeps it reusable for any search surface that wants tag filtering, and keeps
 * the keyboard handling (see `handleKeyDown`) a decision of the host, which is
 * the one that knows which element receives keys.
 */
export class TagFilterBar {
    readonly el: HTMLElement;

    private readonly tags: readonly FilterTag[];
    private readonly onChange: (active: ReadonlySet<string>) => void;
    private readonly chips = new Map<string, HTMLElement>();
    private readonly active = new Set<string>();

    constructor({ tags, onChange }: TagFilterBarOptions) {
        this.tags = tags;
        this.onChange = onChange;
        this.el = createDiv({ cls: 'ronald-task-filters' });

        tags.forEach((filterTag, index) => this.renderChip(filterTag, index));
    }

    /** The tags currently switched on. */
    get activeTags(): ReadonlySet<string> {
        return this.active;
    }

    private renderChip({ tag, type }: FilterTag, index: number): void {
        const chip = this.el.createSpan({
            cls: `ronald-task-filter ronald-task-filter-type-${type}`,
        });
        chip.createSpan({ cls: 'ronald-task-filter-label', text: `#${tag}` });

        const shortcut = shortcutFor(index);
        if (shortcut !== undefined) {
            chip.createSpan({ cls: 'ronald-task-filter-key', text: String(shortcut) });
            chip.setAttribute('aria-keyshortcuts', `${SHORTCUT_MODIFIER}+${shortcut}`);
            chip.setAttribute('aria-label', `${SHORTCUT_MODIFIER}+${shortcut}`);
        }

        chip.addEventListener('click', () => this.toggle(tag));
        this.chips.set(tag, chip);
    }

    /** Flip one tag on or off, ignoring tags this bar does not offer. */
    toggle(tag: string): void {
        if (!this.chips.has(tag)) return;

        if (this.active.has(tag)) this.active.delete(tag);
        else this.active.add(tag);

        this.chips.get(tag)?.toggleClass('is-active', this.active.has(tag));
        this.onChange(this.active);
    }

    /**
     * Toggle the chip a "Mod+<digit>" press points at.
     *
     * Returns true when the key was consumed, so the caller can stop the event
     * from reaching the host — on macOS Cmd+1…9 is otherwise free, but on
     * Windows and Linux Ctrl+1…9 switches Obsidian tabs behind the modal.
     *
     * Only the platform's own command modifier counts, and any other modifier
     * disqualifies the press, so combinations such as Cmd+Shift+1 stay
     * available to other handlers.
     */
    handleKeyDown(event: KeyboardEvent): boolean {
        const commandHeld = Platform.isMacOS ? event.metaKey : event.ctrlKey;
        const otherHeld = Platform.isMacOS ? event.ctrlKey : event.metaKey;
        if (!commandHeld || otherHeld || event.altKey || event.shiftKey) return false;

        const tag = this.tagForShortcut(event.key);
        if (tag === undefined) return false;

        this.toggle(tag);
        return true;
    }

    /** The tag a shortcut digit selects, if the bar has a chip at that spot. */
    private tagForShortcut(key: string): string | undefined {
        if (!/^[1-9]$/.test(key)) return undefined;
        return this.tags[Number(key) - 1]?.tag;
    }
}

/** The digit that toggles the chip at `index`, or none past the ninth chip. */
function shortcutFor(index: number): number | undefined {
    return index < MAX_SHORTCUTS ? index + 1 : undefined;
}
