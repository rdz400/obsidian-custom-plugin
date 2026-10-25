import { findEstimate, formatMinutes } from '../estimate/estimate';
import { type TaskItem, textParts } from '../taskitems';
import type { Drafts } from './draft';
import { type EndState, type GtdTarget, type Group, noteTitle } from './model';

/** What the list needs to draw one render. */
export interface ListState {
    tasks: readonly TaskItem[];
    drafts: Drafts;
    groups: readonly Group[];
    ends: readonly EndState[];
    isSelected: (i: number) => boolean;
    focus: number | undefined;
}

/**
 * The list of the task manager: one group per note, each task a row showing
 * its end state. A tap or click on a row is handed to `onRow`, with the event
 * so the host can tell a Shift+click.
 */
export class ListView {
    readonly el: HTMLElement;
    private readonly gtd: readonly GtdTarget[];

    constructor(gtd: readonly GtdTarget[], onRow: (i: number, event: MouseEvent) => void) {
        this.gtd = gtd;
        this.el = createDiv({
            cls: 'ronald-task-manager-list',
            attr: { role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Tasks', tabindex: '0' },
        });
        this.el.addEventListener('click', (event) => {
            const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
            if (row) onRow(Number(row.dataset.index), event);
        });
    }

    render(state: ListState): void {
        const { groups, ends, isSelected, focus } = state;
        this.el.empty();
        this.el.removeAttribute('aria-activedescendant');

        if (groups.length === 0) {
            this.el.createDiv({ cls: 'ronald-task-manager-empty', text: 'No tasks match these filters' });
            return;
        }

        for (const group of groups) {
            const groupEl = this.el.createDiv({ cls: 'ronald-task-manager-group', attr: { role: 'group' } });
            const heading = groupEl.createDiv({ cls: 'ronald-task-manager-group-heading' });
            heading.createSpan({ text: group.title });
            heading.createSpan({ cls: 'ronald-task-manager-group-count', text: ` · ${group.count}` });
            groupEl.setAttribute('aria-label', `${group.title}, ${group.count}`);

            for (const { index, depth, context } of group.rows) {
                const row = this.renderRow(groupEl, state, index, depth, ends[index]!);
                if (context) {
                    row.addClass('is-context');
                    continue;
                }
                row.dataset.index = String(index);
                row.id = `ronald-task-manager-row-${index}`;
                row.setAttribute('role', 'option');
                const selected = isSelected(index);
                row.setAttribute('aria-selected', String(selected));
                row.toggleClass('is-selected', selected);
                if (focus === index) {
                    row.addClass('is-focused');
                    this.el.setAttribute('aria-activedescendant', row.id);
                }
            }
        }
    }

    /** Scroll the focused row into view, if there is one. */
    revealFocus(): void {
        this.el.querySelector('.is-focused')?.scrollIntoView({ block: 'nearest' });
    }

    private renderRow(
        groupEl: HTMLElement,
        { tasks, drafts }: ListState,
        i: number,
        depth: number,
        end: EndState,
    ): HTMLElement {
        const task = tasks[i]!;
        const draft = drafts.draft(i);
        const base = drafts.base(i);

        const row = groupEl.createDiv({ cls: 'ronald-task-manager-row' });
        row.style.setProperty('--depth', String(depth));
        row.toggleClass('is-done', end.done);
        row.toggleClass('is-changed', drafts.isChanged(i));

        const estimate = findEstimate(task.text);
        const text = estimate
            ? `${task.text.slice(0, estimate.from)} ${task.text.slice(estimate.to)}`.replace(/\s+/g, ' ').trim()
            : task.text;
        const textEl = row.createSpan({ cls: 'ronald-task-manager-text' });
        for (const part of textParts(text)) {
            // Without the brackets the search keeps: styled as a link, it needs none.
            if (part.link) textEl.createSpan({ cls: 'ronald-task-manager-link', text: part.text.slice(2, -2) });
            else textEl.appendText(part.text);
        }

        // Where it came from, its tags and its estimate, kept together.
        const meta = row.createSpan({ cls: 'ronald-task-manager-meta' });
        if (end.path !== task.file.path) {
            meta.createSpan({
                cls: 'ronald-task-manager-from',
                text: `from ${noteTitle(task.file.path, this.gtd)}`,
            });
        }

        const tags = meta.createSpan({ cls: 'ronald-task-manager-tags' });
        for (const tag of draft.ownTags) {
            const pill = tags.createSpan({ cls: 'ronald-task-manager-tag', text: `#${tag}` });
            if (!base.ownTags.includes(tag)) pill.addClass('is-added');
        }
        for (const tag of base.ownTags) {
            if (draft.ownTags.includes(tag)) continue;
            tags.createSpan({ cls: 'ronald-task-manager-tag is-removed', text: `#${tag}` });
        }
        for (const tag of end.tags) {
            if (draft.ownTags.includes(tag)) continue;
            tags.createSpan({ cls: 'ronald-task-manager-tag ronald-task-manager-tag-inherited', text: `#${tag}` });
        }

        if (estimate) {
            meta.createSpan({ cls: 'ronald-task-manager-estimate', text: formatMinutes(estimate.minutes) });
        }
        return row;
    }
}
