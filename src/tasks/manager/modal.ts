import { App, Modal, Notice } from 'obsidian';

import { FilterBar, type FilterChip } from '../../shared/ui/filterbar';
import { ActionBar } from './actionbar';
import { applyInBackground } from './apply';
import { ConfirmCloseModal } from './confirm';
import { Drafts, type GtdId } from './draft';
import { handleManagerKey, type KeyTarget } from './keys';
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
export class TaskManagerModal extends Modal implements KeyTarget {
    private data: ManagerData;
    private drafts: Drafts;
    /** Reads the notes again, as `data` was read. */
    private readonly reload: () => Promise<ManagerData>;
    // Not "selection": Modal keeps the text selection it restores there.
    readonly picked = new Selection();
    readonly tags: readonly string[];
    private readonly tagBar: FilterBar;
    private readonly noteBar: FilterBar;
    private readonly viewBar: FilterBar;
    private readonly list: ListView;
    private readonly bar: ActionBar;
    /** The tasks passing the filters at the last filter change, kept on screen. */
    private pinned = new Set<number>();
    private ends: EndState[] = [];
    /** The selectable rows, in list order. */
    rows: number[] = [];
    /** While writing: the bar says so and input is ignored. */
    private applying = false;

    constructor(
        app: App,
        data: ManagerData,
        tagChips: readonly FilterChip[],
        reload: () => Promise<ManagerData>,
    ) {
        super(app);
        this.data = data;
        this.reload = reload;
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
            if (this.applying) return;
            if (event.shiftKey) this.picked.extendTo(this.rows, i);
            else this.picked.toggle(i);
            this.refresh();
        });
        this.bar = new ActionBar(this.tags, data.gtd, {
            onTag: (tag) => this.toggleTag(tag),
            onMove: (to) => this.move(to),
            onFinish: () => this.toggleDone(),
            onUndo: () => this.undo(),
            onDiscard: () => {
                this.drafts.discard();
                this.refresh();
            },
            onApply: () => void this.apply(),
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
                if (!this.applying && !handleManagerKey(event, this)) return;
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

    /**
     * Close, asking first while changes are pending: every way of closing
     * (✕, Escape, a tap outside, the back gesture) comes through here.
     */
    close(): void {
        const pending = this.drafts.changed().length;
        // While writing, the changes are on their way: nothing to ask.
        if (this.applying || pending === 0) {
            super.close();
            return;
        }
        new ConfirmCloseModal(this.app, pending, (choice) => {
            if (choice === 'discard') {
                this.drafts.discard();
                super.close();
                return;
            }
            void this.apply().then(() => super.close());
        }).open();
    }

    chipKey(event: KeyboardEvent): boolean {
        return this.tagBar.handleKeyDown(event) || this.noteBar.handleKeyDown(event);
    }

    toggleView(value: string): void {
        this.viewBar.toggle(value);
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
    refresh(filtersChanged = false): void {
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
            tags: new Map(this.tags.map((tag) => [tag, tagState(this.drafts, selected, tag)])),
            allIn: new Set(gtd.filter(({ path }) => allIn(this.ends, selected, path)).map(({ id }) => id)),
            allDone: allDone(this.drafts, selected),
            applying: this.applying,
        });
        this.list.revealFocus();
    }

    /** Run a staged action on the selection and show its result. */
    private act(action: (selected: number[]) => boolean): void {
        const selected = this.picked.values();
        if (action(selected)) this.refresh();
    }

    /** Add the tag to every selected task lacking it, or take it off when all have it. */
    toggleTag(tag: string): void {
        this.act((selected) =>
            selected.length > 0 && this.drafts.setTag(selected, tag, tagState(this.drafts, selected, tag) !== 'all'),
        );
    }

    toggleDone(): void {
        this.act((selected) => selected.length > 0 && this.drafts.setDone(selected, !allDone(this.drafts, selected)));
    }

    move(to: GtdId): void {
        if (!this.data.targets.has(to)) return;
        const selected = this.picked.values();
        if (selected.length === 0 || allIn(this.ends, selected, this.data.targets.get(to)!)) return;
        this.act(() => this.drafts.move(selected, to));
    }

    /** Step back one staged action. */
    undo(): void {
        this.act(() => this.drafts.undo());
    }

    /**
     * Write the pending changes, then read the notes again: the modal stays
     * open on what the notes now say, with nothing pending and nothing
     * selected, so Escape closes it. The notes are read again even when
     * writing failed, so a change is never offered twice.
     */
    async apply(): Promise<void> {
        if (this.applying || this.drafts.changed().length === 0) return;
        this.applying = true;
        this.refresh();
        try {
            await applyInBackground(this.app, this.data, this.drafts);
            this.data = await this.reload();
            this.drafts = new Drafts(this.data.tasks, this.data.targets);
            this.picked.clear();
            this.picked.focus = undefined;
        } catch (error) {
            new Notice(`Could not read the notes again: ${error instanceof Error ? error.message : String(error)}`);
            super.close();
        } finally {
            this.applying = false;
        }
        this.refresh(true);
    }
}
