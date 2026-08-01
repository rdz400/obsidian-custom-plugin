import { Platform } from 'obsidian';

/**
 * Modifier a bar's chip shortcuts are held with.
 *
 * "mod" is the platform's own command key — Cmd on macOS, Ctrl elsewhere —
 * and is the default, so a lone bar gets the shortcut a user expects on their
 * platform without the host having to ask. "cmd", "ctrl" and "alt" name a key
 * outright, for a host that stacks bars and needs their digits kept apart, or
 * that wants one specific key whatever the platform.
 *
 * On Windows and Linux "cmd" would be the Windows/Super key, which the desktop
 * reserves; there it resolves to Ctrl instead, making "cmd" and "mod" the same
 * request off macOS.
 */
export type ShortcutModifier = 'mod' | 'cmd' | 'ctrl' | 'alt';

/** How many chips can be reached by a shortcut: Mod+1 … Mod+9. */
const MAX_SHORTCUTS = 9;

/** The concrete key a `ShortcutModifier` stands for on this platform. */
type ResolvedModifier = 'meta' | 'ctrl' | 'alt';

/**
 * Which physical key `modifier` asks for here.
 *
 * Only macOS has a Meta key worth binding, so both "mod" and "cmd" fall back
 * to Ctrl elsewhere.
 */
function resolveModifier(modifier: ShortcutModifier): ResolvedModifier {
    if (modifier === 'alt') return 'alt';
    if (modifier === 'ctrl') return 'ctrl';
    return Platform.isMacOS ? 'meta' : 'ctrl';
}

/** What the modifier is called on this platform, for hints and tooltips. */
function modifierLabel(modifier: ShortcutModifier): string {
    switch (resolveModifier(modifier)) {
        case 'meta':
            return 'Cmd';
        case 'alt':
            return Platform.isMacOS ? 'Option' : 'Alt';
        default:
            return 'Ctrl';
    }
}

/**
 * True when `event` carries exactly the key `modifier` asks for.
 *
 * The match is on the whole modifier state, not just the wanted key: every
 * other modifier has to be absent, so combinations such as Cmd+Shift+1 stay
 * available to other handlers and — with several bars listening on one element
 * — a press can only ever be claimed by the one bar whose modifier it names.
 */
function modifierHeld(event: KeyboardEvent, modifier: ShortcutModifier): boolean {
    const wanted = resolveModifier(modifier);

    return (
        !event.shiftKey &&
        event.metaKey === (wanted === 'meta') &&
        event.ctrlKey === (wanted === 'ctrl') &&
        event.altKey === (wanted === 'alt')
    );
}

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
    /**
     * Modifier the chip shortcuts are held with: "mod" (the default, Cmd on
     * macOS and Ctrl elsewhere), or "cmd", "ctrl" or "alt" to name one outright.
     */
    modifier?: ShortcutModifier;
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
    private readonly modifier: ShortcutModifier;
    private readonly chipEls = new Map<string, HTMLElement>();
    private readonly counts = new Map<string, HTMLElement>();
    private readonly active = new Set<string>();

    constructor({ chips, onChange, modifier = 'mod' }: FilterBarOptions) {
        this.chips = chips;
        this.onChange = onChange;
        this.modifier = modifier;
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
            const label = modifierLabel(this.modifier);
            chip.setAttribute('aria-keyshortcuts', `${label}+${shortcut}`);
            chip.setAttribute('aria-label', `${text} (${label}+${shortcut})`);
            chip.setAttribute('title', `${label}+${shortcut}`);
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
     * Toggle the chip a "<modifier>+<digit>" press points at.
     *
     * Returns true when the key was consumed, so the caller can stop the event
     * from reaching the host — on macOS Cmd+1…9 is otherwise free, but on
     * Windows and Linux Ctrl+1…9 switches Obsidian tabs behind the modal.
     *
     * A host can hand the same element to several bars: each only answers to
     * its own modifier (see `modifierHeld`), so their digits never collide.
     */
    handleKeyDown(event: KeyboardEvent): boolean {
        if (!modifierHeld(event, this.modifier)) return false;

        const value = this.valueForShortcut(event);
        if (value === undefined) return false;

        this.toggle(value);
        return true;
    }

    /**
     * The value a press selects, if the bar has a chip at that digit.
     *
     * Read off `code` rather than `key`, because holding Alt on macOS turns
     * the digit into the character it composes — Option+1 arrives as "¡" —
     * while `code` stays "Digit1". `code` is layout-dependent in general, but
     * only the digit row is at stake here.
     */
    private valueForShortcut(event: KeyboardEvent): string | undefined {
        const digit = /^Digit([1-9])$/.exec(event.code)?.[1] ?? event.key;
        if (!/^[1-9]$/.test(digit)) return undefined;
        return this.chips[Number(digit) - 1]?.value;
    }
}

/** The digit that toggles the chip at `index`, or none past the ninth chip. */
function shortcutFor(index: number): number | undefined {
    return index < MAX_SHORTCUTS ? index + 1 : undefined;
}
