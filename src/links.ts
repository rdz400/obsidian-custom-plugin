import { Plugin, editorLivePreviewField } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
} from '@codemirror/view';

/**
 * Turn a wikilink target into a CSS-safe slug:
 * lower case, spaces -> hyphens, anything that isn't a-z/0-9/-/_ removed,
 * collapsed and trimmed hyphens.
 */
export function linkToSlug(link: string): string {
    return link
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * The full class we add, prefixed so it can't collide with random slugs
 * like "internal-link" produced by a note literally named "internal link".
 */
function slugClass(link: string): string {
    const slug = linkToSlug(link);
    return slug ? `link-${slug}` : '';
}

/* -------------------------------------------------------------------------- */
/* Live Preview (CodeMirror editor extension)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Obsidian renders an internal link in Live Preview roughly as:
 *
 *   <span class="cm-hmd-internal-link cm-list-1">
 *     <span class="cm-underline" ...>obsidian</span>
 *   </span>
 *
 * The `cm-hmd-internal-link` span carries the link text. We read that text,
 * slugify it and attach `link-<slug>` as a mark decoration on the same range.
 *
 * We drive this off the visible line text rather than the DOM, matching the
 * ranges CodeMirror already tokenised as internal links.
 */

// Matches [[link]] and [[link|alias]], capturing the link target (before |).
const WIKILINK_RE = /\[\[([^\]|#^]+?)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;

class LinkSlugPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate): void {
        if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            // Live Preview <-> source mode toggle
            update.startState.field(editorLivePreviewField) !==
                update.state.field(editorLivePreviewField)
        ) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    private buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();

        // Only decorate in Live Preview, not raw source mode.
        if (!view.state.field(editorLivePreviewField)) {
            return builder.finish();
        }

        for (const { from, to } of view.visibleRanges) {
            const text = view.state.sliceDoc(from, to);
            WIKILINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = WIKILINK_RE.exec(text)) !== null) {
                const target = match[1];
                if (!target) continue;
                const cls = slugClass(target);
                if (!cls) continue;

                // Decorate the visible link text only (between [[ and ]] / |).
                const linkStart = from + match.index + 2; // skip "[["
                const linkEnd = linkStart + target.length;

                builder.add(
                    linkStart,
                    linkEnd,
                    Decoration.mark({ class: cls }),
                );
            }
        }

        return builder.finish();
    }
}

const linkSlugViewPlugin = ViewPlugin.fromClass(LinkSlugPlugin, {
    decorations: (v) => v.decorations,
});

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Register the wikilink slug class rendering for Live Preview.
 * Reading Mode already exposes the target via `data-href`, so it's not needed
 * there. Call this from the plugin's `onload`.
 */
export function registerLinkSlugs(plugin: Plugin): void {
    plugin.registerEditorExtension(linkSlugViewPlugin);
}
