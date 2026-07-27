import { Platform } from 'obsidian';

/** Modifier used for the chip shortcuts, so the hint matches the platform. */
const SHORTCUT_MODIFIER = Platform.isMacOS ? 'Cmd' : 'Ctrl';

/** How many chips can be reached by a shortcut: Mod+1 … Mod+9. */
const MAX_SHORTCUTS = 9;

/**
 * One filter chip: the value it toggles, and the "type" it belongs to.
 *
 * The type is purely presentational (see `renderChip`) so callers can group
 * chips like "buiten"/"thuis" (context) apart from "vandaag"/"week" (time)
 * without the bar needing to know what the types mean.
 */
export interface FilterChip {
    value: string;
    type: string;
    /** Chip text, if not the value itself prefixed with "#". */
    label?: string;
}

/** Everything the bar needs to know about the world it is placed in. */
export interface FilterBarOptions {
    /** The chips offered, in the order they are shown and numbered. */
    chips: readonly FilterChip[];
    /** Called after every change, with the values that are now active. */
    onChange: (active: ReadonlySet<string>) => void;
}

/** How many results each value stands for, keyed by value; missing means zero. */
export type FilterCounts = ReadonlyMap<string, number>;

/**
 * A row of toggleable filter chips.
 *
 * The bar owns nothing but its own element and selection: it never touches the
 * modal it is dropped into, and reports changes through `onChange` only. That
 * keeps it reusable for any search surface that wants chip filtering, and keeps
 * the keyboard handling (see `handleKeyDown`) a decision of the host, which is
 * the one that knows which element receives keys.
 *
 * The badge on each chip shows how many results that value stands for, which
 * only the host can know; it hands them over with `setCounts`. Until it does,
 * the chips carry no badge at all rather than a misleading zero.
 */
export class FilterBar {
    readonly el: HTMLElement;

    private readonly chips: readonly FilterChip[];
    private readonly onChange: (active: ReadonlySet<string>) => void;
    private readonly chipEls = new Map<string, HTMLElement>();
    private readonly counts = new Map<string, HTMLElement>();
    private readonly active = new Set<string>();

    constructor({ chips, onChange }: FilterBarOptions) {
        this.chips = chips;
        this.onChange = onChange;
        this.el = createDiv({ cls: 'ronald-task-filters' });

        chips.forEach((chip, index) => this.renderChip(chip, index));
    }

    /** The values currently switched on. */
    get activeValues(): ReadonlySet<string> {
        return this.active;
    }

    private renderChip({ value, type, label }: FilterChip, index: number): void {
        const chip = this.el.createSpan({
            cls: `ronald-task-filter ronald-task-filter-type-${type}`,
        });
        const text = label ?? `#${value}`;
        chip.createSpan({ cls: 'ronald-task-filter-label', text });

        // The badge slot doubles as the count display, so it is created empty
        // and hidden until `setCounts` fills it.
        const count = chip.createSpan({ cls: 'ronald-task-filter-count' });
        count.hide();
        this.counts.set(value, count);

        // The count has the only badge, so the shortcut is not written on the
        // chip: it lives in the tooltip and in the label read out instead.
        const shortcut = shortcutFor(index);
        if (shortcut !== undefined) {
            chip.setAttribute('aria-keyshortcuts', `${SHORTCUT_MODIFIER}+${shortcut}`);
            chip.setAttribute('aria-label', `${text} (${SHORTCUT_MODIFIER}+${shortcut})`);
            chip.setAttribute('title', `${SHORTCUT_MODIFIER}+${shortcut}`);
        }

        chip.addEventListener('click', () => this.toggle(value));
        this.chipEls.set(value, chip);
    }

    /**
     * Show how many results each value stands for.
     *
     * A value missing from `counts` reads as zero: such a chip would narrow the
     * results to nothing, so it is dimmed rather than hidden — the row keeps
     * its layout and its shortcut numbering while typing.
     */
    setCounts(counts: FilterCounts): void {
        for (const [value, badge] of this.counts) {
            const total = counts.get(value) ?? 0;
            badge.setText(String(total));
            badge.show();
            this.chipEls.get(value)?.toggleClass('is-empty', total === 0);
        }
    }

    /** Flip one value on or off, ignoring values this bar does not offer. */
    toggle(value: string): void {
        if (!this.chipEls.has(value)) return;

        if (this.active.has(value)) this.active.delete(value);
        else this.active.add(value);

        this.chipEls.get(value)?.toggleClass('is-active', this.active.has(value));
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

        const value = this.valueForShortcut(event.key);
        if (value === undefined) return false;

        this.toggle(value);
        return true;
    }

    /** The value a shortcut digit selects, if the bar has a chip at that spot. */
    private valueForShortcut(key: string): string | undefined {
        if (!/^[1-9]$/.test(key)) return undefined;
        return this.chips[Number(key) - 1]?.value;
    }
}

/** The digit that toggles the chip at `index`, or none past the ninth chip. */
function shortcutFor(index: number): number | undefined {
    return index < MAX_SHORTCUTS ? index + 1 : undefined;
}
