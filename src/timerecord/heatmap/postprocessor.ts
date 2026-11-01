import type { App, MarkdownPostProcessor, TFile } from 'obsidian';

import { heatClasses, timeHour } from './heatmap';

/**
 * The first child of `el` that holds any text, or null when that is bare
 * text. The empty bullet and fold handle Obsidian puts in front are skipped.
 */
function firstContent(el: Element): Element | null {
    for (const node of Array.from(el.childNodes)) {
        if (!node.textContent?.trim()) continue;
        return node.instanceOf(Element) ? node : null;
    }
    return null;
}

/**
 * Colour the time a rendered record opens with: inline code at the very start
 * of the list item, which in a loose list sits inside a paragraph. The class
 * goes on the `code` element itself, so nothing needs wrapping.
 */
function markRecordTime(item: HTMLElement): void {
    let first = firstContent(item);
    if (first?.tagName === 'P') first = firstContent(first);
    if (first?.tagName !== 'CODE') return;

    const hour = timeHour(first.textContent ?? '');
    if (hour !== null) first.addClasses(heatClasses(hour).split(' '));
}

/** The reading mode counterpart of the editor extension, for notes `applies` accepts. */
export function heatmapPostProcessor(
    app: App,
    applies: (file: TFile) => boolean,
): MarkdownPostProcessor {
    return (el, ctx) => {
        const file = app.vault.getFileByPath(ctx.sourcePath);
        if (!file || !applies(file)) return;
        // Tasks are left out, as in the editor: a record is a plain list item.
        el.querySelectorAll<HTMLElement>('li:not(.task-list-item)').forEach(markRecordTime);
    };
}
