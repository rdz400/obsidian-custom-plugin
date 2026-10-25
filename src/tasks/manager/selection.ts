/**
 * Which tasks are selected in the task manager, which one has the keyboard
 * focus, and the anchor a range is selected from. Tasks are known by their
 * index; `rows` is always the selectable rows in list order, context rows
 * left out, so the focus skips those.
 */
export class Selection {
    private selected = new Set<number>();
    /** The task the keyboard acts on. */
    focus: number | undefined;
    private anchor: number | undefined;
    /** What was selected when the anchor was set: a range extends that. */
    private beforeRange = new Set<number>();

    has(i: number): boolean {
        return this.selected.has(i);
    }

    get size(): number {
        return this.selected.size;
    }

    values(): number[] {
        return [...this.selected];
    }

    /** Select or unselect one task, with focus and anchor on it, as a tap does. */
    toggle(i: number): void {
        if (this.selected.has(i)) this.selected.delete(i);
        else this.selected.add(i);
        this.setAnchor(i);
    }

    /**
     * Select from the anchor to `i`, both ways, on top of what was selected
     * before the anchor was set, and focus `i`. Without an anchor in `rows`,
     * the focus is the anchor, or else `i` itself.
     */
    extendTo(rows: readonly number[], i: number): void {
        if (this.anchor === undefined || !rows.includes(this.anchor)) {
            this.setAnchor(this.focus !== undefined && rows.includes(this.focus) ? this.focus : i);
        }
        const from = rows.indexOf(this.anchor!);
        const to = rows.indexOf(i);
        if (to === -1) return;
        const range = rows.slice(Math.min(from, to), Math.max(from, to) + 1);
        this.selected = new Set([...this.beforeRange, ...range]);
        this.focus = i;
    }

    /** Move the focus `step` rows down (or up, when negative), staying within `rows`. */
    moveFocus(rows: readonly number[], step: number): number | undefined {
        this.focus = this.neighbour(rows, step);
        return this.focus;
    }

    /**
     * Move the focus `step` rows and select from the anchor to it, as
     * Shift+↓ does. Without an anchor, the range starts where the focus was.
     */
    extendBy(rows: readonly number[], step: number): void {
        const target = this.neighbour(rows, step);
        if (target === undefined) return;
        if (this.anchor === undefined || !rows.includes(this.anchor)) {
            this.setAnchor(this.focus !== undefined && rows.includes(this.focus) ? this.focus : target);
        }
        this.extendTo(rows, target);
    }

    /** The row `step` rows from the focus, within `rows`; the first or last without a focus. */
    private neighbour(rows: readonly number[], step: number): number | undefined {
        if (rows.length === 0) return undefined;
        const at = this.focus === undefined ? -1 : rows.indexOf(this.focus);
        const next = at === -1 ? (step > 0 ? 0 : rows.length - 1) : at + step;
        return rows[Math.max(0, Math.min(rows.length - 1, next))];
    }

    /** Select every one of `rows`. */
    selectAll(rows: readonly number[]): void {
        this.selected = new Set(rows);
    }

    clear(): void {
        this.selected.clear();
        this.beforeRange.clear();
        this.anchor = undefined;
    }

    /** Keep only what is still among `rows`, after a filter change hid the rest. */
    prune(rows: readonly number[]): void {
        const shown = new Set(rows);
        this.selected = new Set([...this.selected].filter((i) => shown.has(i)));
        this.beforeRange = new Set([...this.beforeRange].filter((i) => shown.has(i)));
        if (this.focus !== undefined && !shown.has(this.focus)) this.focus = undefined;
        if (this.anchor !== undefined && !shown.has(this.anchor)) this.anchor = undefined;
    }

    private setAnchor(i: number): void {
        this.anchor = i;
        this.focus = i;
        this.beforeRange = new Set(this.selected);
    }
}
