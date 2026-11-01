import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    type EditorView,
    ViewPlugin,
    type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField, type TFile } from 'obsidian';

/** A stretch of one line to wrap in a class, by offsets within the line. */
export interface LineMark {
    from: number;
    to: number;
    /** One class or several, separated by spaces. */
    cls: string;
}

/** The mark for the text of one line, or null when the line gets none. */
export type LineMarkFinder = (text: string) => LineMark | null;

/**
 * Mark the visible lines `find` picks out, when the editor holds a note
 * `applies` accepts. Only the visible lines are read, so a long note costs no
 * more than a short one.
 */
function buildDecorations(
    view: EditorView,
    applies: (file: TFile) => boolean,
    find: LineMarkFinder,
    decorationOf: (cls: string) => Decoration,
): DecorationSet {
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

            const mark = find(line.text);
            if (mark) builder.add(line.from + mark.from, line.from + mark.to, decorationOf(mark.cls));
        }
    }
    return builder.finish();
}

/**
 * An editor extension that wraps one stretch per line in a class, in live
 * preview and source mode alike: the editor's side of styling a note, with a
 * markdown post processor doing the same in reading mode.
 *
 * Rebuilt on every edit and scroll. Opening another note in the same tab
 * replaces the text, which counts as an edit, so the note is checked anew.
 */
export function lineMarker(applies: (file: TFile) => boolean, find: LineMarkFinder) {
    // One decoration per class, made once rather than on every rebuild.
    const decorations = new Map<string, Decoration>();
    const decorationOf = (cls: string) => {
        let decoration = decorations.get(cls);
        if (!decoration) {
            decoration = Decoration.mark({ class: cls });
            decorations.set(cls, decoration);
        }
        return decoration;
    };

    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view, applies, find, decorationOf);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildDecorations(update.view, applies, find, decorationOf);
                }
            }
        },
        { decorations: (plugin) => plugin.decorations },
    );
}
