import { ButtonComponent, setIcon } from 'obsidian';

import type { GtdId } from './draft';
import type { GtdTarget, TagState } from './model';

/** The keys of the move buttons, by GTD note. */
export const MOVE_KEYS: Record<GtdId, string> = { today: 'T', someday: 'S', overview: 'O', inbox: 'I' };

/** What the bar does when a button is pressed. */
export interface ActionHandlers {
    onTag: (tag: string) => void;
    onMove: (to: GtdId) => void;
    onFinish: () => void;
    onUndo: () => void;
    onDiscard: () => void;
    onApply: () => void;
}

/** What the bar shows in one render. */
export interface BarState {
    tally: string;
    /** How many tasks applying would change. */
    changed: number;
    selected: number;
    canUndo: boolean;
    /** The tooltip of Undo: what it would undo. */
    undoLabel: string;
    tags: ReadonlyMap<string, TagState>;
    /** The GTD notes every selected task already ends up in. */
    allIn: ReadonlySet<GtdId>;
    allDone: boolean;
    applying: boolean;
    canApply: boolean;
}

/** Show a key in a button's tooltip and to assistive technology. */
function setKey(el: HTMLElement, label: string, key: string): void {
    el.setAttribute('title', `${label} (${key})`);
    el.setAttribute('aria-keyshortcuts', key);
}

/**
 * The bar at the bottom of the task manager, always there: the tally with
 * Undo, Discard and Apply; a button per filter tag; and Move to the GTD notes
 * with Finish. Built once, and brought up to date by `update`.
 */
export class ActionBar {
    readonly el: HTMLElement;
    private readonly tally: HTMLElement;
    private readonly undo: ButtonComponent;
    private readonly discard: ButtonComponent;
    private readonly apply: ButtonComponent;
    private readonly tagButtons = new Map<string, HTMLButtonElement>();
    private readonly moveButtons = new Map<GtdId, HTMLButtonElement>();
    private readonly finish: HTMLButtonElement;
    private readonly finishIcon: HTMLElement;
    private readonly finishLabel: HTMLElement;

    constructor(tags: readonly string[], gtd: readonly GtdTarget[], handlers: ActionHandlers) {
        this.el = createDiv({ cls: 'ronald-task-manager-bar' });

        const first = this.el.createDiv({ cls: 'ronald-task-manager-bar-row' });
        this.tally = first.createSpan({ cls: 'ronald-task-manager-tally', attr: { 'aria-live': 'polite' } });
        const buttons = first.createDiv({ cls: 'ronald-task-manager-bar-end' });
        this.undo = new ButtonComponent(buttons).setIcon('undo-2').onClick(handlers.onUndo);
        this.discard = new ButtonComponent(buttons).setButtonText('Discard').onClick(handlers.onDiscard);
        this.apply = new ButtonComponent(buttons).setCta().onClick(handlers.onApply);
        this.apply.buttonEl.addClass('ronald-task-manager-apply');
        setKey(this.apply.buttonEl, 'Apply the changes', 'Mod+Enter');

        const tagRow = this.el.createDiv({ cls: 'ronald-task-manager-bar-row ronald-task-manager-tag-row' });
        tags.forEach((tag, index) => {
            const button = tagRow.createEl('button', { cls: 'ronald-task-manager-tag-button' });
            button.createSpan({ cls: 'ronald-task-manager-tag-state', attr: { 'aria-hidden': 'true' } });
            button.appendText(`#${tag}`);
            if (index < 9) setKey(button, `Toggle #${tag}`, String(index + 1));
            button.addEventListener('click', () => handlers.onTag(tag));
            this.tagButtons.set(tag, button);
        });

        const moveRow = this.el.createDiv({ cls: 'ronald-task-manager-bar-row ronald-task-manager-move-row' });
        moveRow.createSpan({ cls: 'ronald-task-manager-move-label', text: 'Move to' });
        for (const { id, name } of gtd) {
            const label = name.charAt(0).toUpperCase() + name.slice(1);
            const button = moveRow.createEl('button', {
                cls: 'ronald-task-manager-move-button',
                attr: { 'aria-label': `Move to ${name}` },
            });
            button.createSpan({ cls: 'ronald-task-manager-move-name', text: label });
            button.createSpan({ cls: 'ronald-task-manager-move-letter', text: MOVE_KEYS[id] });
            setKey(button, `Move to ${name}`, MOVE_KEYS[id]);
            button.addEventListener('click', () => handlers.onMove(id));
            this.moveButtons.set(id, button);
        }
        this.finish = moveRow.createEl('button', { cls: 'ronald-task-manager-finish' });
        this.finishIcon = this.finish.createSpan({ cls: 'ronald-task-manager-finish-icon' });
        this.finishLabel = this.finish.createSpan();
        this.finish.addEventListener('click', handlers.onFinish);
    }

    update(state: BarState): void {
        const idle = !state.applying;
        const some = state.selected > 0 && idle;
        // On a phone the change rows give their room to the list while unused.
        this.el.toggleClass('is-unselected', state.selected === 0);

        this.tally.setText(state.applying ? 'Applying…' : state.tally);
        this.undo.setDisabled(!state.canUndo || !idle);
        setKey(this.undo.buttonEl, state.undoLabel, 'Mod+Z');
        this.undo.buttonEl.setAttribute('aria-label', state.undoLabel);
        this.discard.setDisabled(state.changed === 0 || !idle);
        this.apply.setButtonText(state.changed > 0 ? `Apply ${state.changed}` : 'Apply');
        this.apply.setDisabled(state.changed === 0 || !state.canApply || !idle);

        for (const [tag, button] of this.tagButtons) {
            const tagState = state.tags.get(tag) ?? 'none';
            button.disabled = !some;
            button.toggleClass('is-partial', tagState === 'some');
            button.toggleClass('is-all', tagState === 'all');
            button.setAttribute('aria-pressed', tagState === 'all' ? 'true' : tagState === 'some' ? 'mixed' : 'false');
            button.querySelector('.ronald-task-manager-tag-state')?.setText(tagState === 'some' ? '◐' : '');
        }
        for (const [id, button] of this.moveButtons) {
            button.disabled = !some || state.allIn.has(id);
        }

        const reopen = state.allDone;
        setIcon(this.finishIcon, reopen ? 'rotate-ccw' : 'check');
        this.finishLabel.setText(reopen ? 'Reopen' : 'Finish');
        this.finish.disabled = !some;
        setKey(this.finish, reopen ? 'Reopen the selected tasks' : 'Finish the selected tasks', 'X');
    }
}
