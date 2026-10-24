import type { App, MarkdownPostProcessor, TFile } from 'obsidian';

import { ESTIMATE_CLASS, findEstimate } from './estimate';

/**
 * The text nodes of `item` itself, in order, leaving out those of its
 * subtasks, which are list items of their own.
 */
function ownTextNodes(item: HTMLElement): Text[] {
    const nodes: Text[] = [];
    const walker = item.doc.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('li') === item) nodes.push(node as Text);
    }
    return nodes;
}

/**
 * Wrap the estimate of one rendered task in a span.
 *
 * The rendered text reads like the source minus its markup — tags keep their
 * "#", a block id is dropped — so the source rule finds the estimate in it.
 * Its offset is then traced back to the text node holding it.
 */
function markEstimate(item: HTMLElement): void {
    const nodes = ownTextNodes(item);
    const estimate = findEstimate(nodes.map((node) => node.data).join(''));
    if (!estimate) return;

    let offset = 0;
    for (const node of nodes) {
        const end = offset + node.data.length;
        if (estimate.from >= offset && estimate.to <= end) {
            const range = item.doc.createRange();
            range.setStart(node, estimate.from - offset);
            range.setEnd(node, estimate.to - offset);
            range.surroundContents(createSpan({ cls: ESTIMATE_CLASS }));
            return;
        }
        offset = end;
    }
}

/** The reading mode counterpart of the editor extension, for notes `applies` accepts. */
export function estimatePostProcessor(
    app: App,
    applies: (file: TFile) => boolean,
): MarkdownPostProcessor {
    return (el, ctx) => {
        const file = app.vault.getFileByPath(ctx.sourcePath);
        if (!file || !applies(file)) return;
        el.querySelectorAll<HTMLElement>('li.task-list-item').forEach(markEstimate);
    };
}
