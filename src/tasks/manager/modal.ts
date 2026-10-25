import { App, Keymap, Modal } from 'obsidian';

import { FilterBar, type FilterChip } from '../../shared/ui/filterbar';
import { ActionBar, MOVE_KEYS } from './actionbar';
import { Drafts, type GtdId } from './draft';
import { ListView } from './listview';
import type { ManagerData } from './load';
import {
    allDone,
    allIn,
    type EndState,
    endStates,
    type Filters,
    groupRows,
    matching,
    noteCounts,
    selectableRows,
    tagCounts,
    tagState,
    tallyText,
    visibleTasks,
} from './model';
import { Selection } from './selection';

/** The view chips at the end of the note row, toggled with their letter. */
const VIEW_CHIPS: readonly FilterChip[] = [
    { value: 'done', type: 'view', label: 'Done', hint: 'D' },
    { value: 'top-level', type: 'view', label: 'Top-level', hint: 'L' },
];

/**
 * The task manager: every task in the task notes, grouped by note, to select
 * and change many at once. Changes are staged in `drafts` and the list shows
 * where they lead; nothing is written until Apply.
 */
export class TaskManagerModal extends Modal {
    private data: ManagerData;
    private drafts: Drafts;
    // Not "selection": Modal keeps the text selection it restores there.
    private readonly picked = new Selection();
    private readonly tags: readonly string[];
    private readonly tagBar: FilterBar;
    private readonly noteBar: FilterBar;
    private readonly viewBar: FilterBar;
    private readonly list: ListView;
    private readonly bar: ActionBar;
    /** The tasks passing the filters at the last filter change, kept on screen. */
    private pinned = new Set<number>();
    private ends: EndState[] = [];
    /** The selectable rows, in list order. */
    private rows: number[] = [];

    constructor(app: App, data: ManagerData, tagChips: readonly FilterChip[]) {
        super(app);
        this.data = data;
        this.drafts = new Drafts(data.tasks, data.targets);
        this.tags = tagChips.map((chip) => chip.value);

        this.setTitle('Manage tasks');
        this.modalEl.addClass('ronald-task-manager');

        const onFilter = () => this.refresh(true);
        this.tagBar = new FilterBar({ chips: tagChips, onChange: onFilter });
        this.noteBar = new FilterBar({
            chips: data.gtd.map(({ id, name }) => ({ value: id, type: 'gtd', label: name })),
            onChange: onFilter,
            modifier: 'alt',
        });
        this.viewBar = new FilterBar({ chips: VIEW_CHIPS, onChange: onFilter, shortcuts: false });

        this.list = new ListView(data.gtd, (i, event) => {
            if (event.shiftKey) this.picked.extendTo(this.rows, i);
            else this.picked.toggle(i);
            this.refresh();
        });
        this.bar = new ActionBar(this.tags, data.gtd, {
            onTag: (tag) => this.toggleTag(tag),
            onMove: (to) => this.move(to),
            onFinish: () => this.toggleDone(),
            onUndo: () => this.act(() => this.drafts.undo()),
            onDiscard: () => {
                this.drafts.discard();
                this.refresh();
            },
            // Writing comes with apply.ts; until then the button stays disabled.
            onApply: () => undefined,
        });

        const header = this.contentEl.createDiv({ cls: 'ronald-task-manager-header' });
        header.append(this.tagBar.el);
        const noteRow = header.createDiv({ cls: 'ronald-task-manager-note-row' });
        noteRow.append(this.noteBar.el, this.viewBar.el);
        this.contentEl.append(this.list.el, this.bar.el);

        // In the capture phase, so Obsidian's Mod+digit never sees a press
        // meant for a chip.
        this.modalEl.addEventListener(
            'keydown',
            (event) => {
                if (!this.handleKey(event)) return;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true },
        );
    }

    onOpen(): void {
        this.refresh(true);
        this.list.el.focus();
    }

    /**
     * Escape first clears the selection; with nothing selected it closes.
     *
     * Not in Obsidian's types, but what the modal's scope calls on Escape,
     * before any key handler of ours sees the key: the settings modal
     * overrides it the same way.
     */
    onEscapeKey(): void {
        if (this.picked.size === 0) {
            this.close();
            return;
        }
        this.picked.clear();
        this.refresh();
    }

    private get filters(): Filters {
        const view = this.viewBar.activeValues;
        return {
            tags: this.tagBar.activeValues,
            notes: this.noteBar.activeValues,
            done: view.has('done'),
            topLevel: view.has('top-level'),
        };
    }

    /**
     * Draw the list and the bar for the drafts as they are. After a filter
     * change the filters apply to every task again, and a selected task they
     * hide is dropped from the selection, so an action never touches a task
     * out of sight.
     */
    private refresh(filtersChanged = false): void {
        const { notes, tasks, gtd } = this.data;
        const filters = this.filters;
        this.ends = endStates(notes, tasks, this.drafts, gtd);
        if (filtersChanged) this.pinned = matching(this.ends, filters);

        const visible = visibleTasks(this.ends, filters, this.pinned);
        const groups = groupRows(this.ends, tasks, this.drafts, visible, gtd);
        this.rows = selectableRows(groups);
        if (filtersChanged) this.picked.prune(this.rows);

        this.tagBar.setCounts(tagCounts(this.ends, filters, this.tags));
        this.noteBar.setCounts(noteCounts(this.ends, filters, gtd.map(({ id }) => id)));

        const selected = this.picked.values();
        this.list.render({
            tasks,
            drafts: this.drafts,
            groups,
            ends: this.ends,
            isSelected: (i) => this.picked.has(i),
            focus: this.picked.focus,
        });
        const changed = this.drafts.changed().length;
        this.bar.update({
            tally: tallyText(this.rows.length, selected.length, changed),
            changed,
            selected: selected.length,
            canUndo: this.drafts.canUndo,
            undoLabel: 'Undo',
            tags: new Map(this.tags.map((tag) => [tag, tagState(this.drafts, selected, tag)])),
            allIn: new Set(gtd.filter(({ path }) => allIn(this.ends, selected, path)).map(({ id }) => id)),
            allDone: allDone(this.drafts, selected),
            applying: false,
            canApply: false,
        });
        this.list.revealFocus();
    }

    /** Run a staged action on the selection and show its result. */
    private act(action: (selected: number[]) => boolean): void {
        const selected = this.picked.values();
        if (action(selected)) this.refresh();
    }

    /** Add the tag to every selected task lacking it, or take it off when all have it. */
    private toggleTag(tag: string): void {
        this.act((selected) =>
            selected.length > 0 && this.drafts.setTag(selected, tag, tagState(this.drafts, selected, tag) !== 'all'),
        );
    }

    private toggleDone(): void {
        this.act((selected) => selected.length > 0 && this.drafts.setDone(selected, !allDone(this.drafts, selected)));
    }

    private move(to: GtdId): void {
        if (!this.data.targets.has(to)) return;
        const selected = this.picked.values();
        if (selected.length === 0 || allIn(this.ends, selected, this.data.targets.get(to)!)) return;
        this.act(() => this.drafts.move(selected, to));
    }

    /** Handle a key press anywhere in the modal; true when it was used. */
    private handleKey(event: KeyboardEvent): boolean {
        if (this.tagBar.handleKeyDown(event) || this.noteBar.handleKeyDown(event)) return true;

        const mod = Keymap.isModifier(event, 'Mod');
        const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
        const key = event.key.toLowerCase();

        if (plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            const step = event.key === 'ArrowDown' ? 1 : -1;
            if (event.shiftKey) this.picked.extendBy(this.rows, step);
            else this.picked.moveFocus(this.rows, step);
            this.refresh();
            return true;
        }
        if (plain && !event.shiftKey && (event.key === 'Home' || event.key === 'End')) {
            this.picked.focus = event.key === 'Home' ? this.rows[0] : this.rows[this.rows.length - 1];
            this.refresh();
            return true;
        }
        if (mod && !event.shiftKey && key === 'a') {
            this.picked.selectAll(this.rows);
            this.refresh();
            return true;
        }
        if (mod && !event.shiftKey && key === 'z') {
            if (!event.repeat) this.act(() => this.drafts.undo());
            return true;
        }
        if (!plain || event.shiftKey) return false;

        // A focused button takes Space and Enter itself.
        if (event.key === ' ') {
            if (event.target instanceof HTMLButtonElement) return false;
            if (!event.repeat && this.picked.focus !== undefined) {
                this.picked.toggle(this.picked.focus);
                this.refresh();
            }
            return true;
        }
        if (event.repeat) return /^[1-9tsoixdl]$/.test(key);
        if (/^[1-9]$/.test(key)) {
            const tag = this.tags[Number(key) - 1];
            if (tag !== undefined) this.toggleTag(tag);
            return tag !== undefined;
        }
        const move = (Object.keys(MOVE_KEYS) as GtdId[]).find((id) => MOVE_KEYS[id].toLowerCase() === key);
        if (move) {
            this.move(move);
            return true;
        }
        if (key === 'x') this.toggleDone();
        else if (key === 'd') this.viewBar.toggle('done');
        else if (key === 'l') this.viewBar.toggle('top-level');
        else return false;
        return true;
    }
}
