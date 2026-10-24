import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    type EditorView,
    ViewPlugin,
    type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField, type TFile } from 'obsidian';

import { ESTIMATE_CLASS, lineEstimate } from './estimate';

const estimateMark = Decoration.mark({ class: ESTIMATE_CLASS });

/**
 * Mark the estimates on the visible lines, when the editor holds a note
 * `applies` accepts. Only the visible lines are read, so a long note costs no
 * more than a short one.
 */
function buildDecorations(view: EditorView, applies: (file: TFile) => boolean): DecorationSet {
    const file = view.state.field(editorInfoField, false)?.file;
    if (!file || !applies(file)) return Decoration.none;

    const builder = new RangeSetBuilder<Decoration>();
    const { doc } = view.state;
    // Two visible ranges can meet on one line; the builder takes each range once, in order.
    let lastLine = 0;
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = doc.lineAt(pos);
            pos = line.to + 1;
            if (line.number <= lastLine) continue;
            lastLine = line.number;

            const estimate = lineEstimate(line.text);
            if (estimate) builder.add(line.from + estimate.from, line.from + estimate.to, estimateMark);
        }
    }
    return builder.finish();
}

/**
 * The editor extension that colours estimates, in live preview and source
 * mode alike.
 *
 * Rebuilt on every edit and scroll. Opening another note in the same tab
 * replaces the text, which counts as an edit, so the note is checked anew.
 */
export function estimateHighlighter(applies: (file: TFile) => boolean) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view, applies);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildDecorations(update.view, applies);
                }
            }
        },
        { decorations: (plugin) => plugin.decorations },
    );
}
