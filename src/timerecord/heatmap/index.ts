import type { App, Plugin, TFile } from 'obsidian';

import { lineMarker } from '../../shared/editor/linemarks';
import { noteType } from '../../shared/ui/notetype';
import { heatClasses, lineRecordTime } from './heatmap';
import { heatmapPostProcessor } from './postprocessor';

/** The frontmatter `type` of a note whose times are coloured. */
const TIME_RECORD_TYPE = 'tijdsregistratie';

/**
 * Whether `file` keeps time records, by its frontmatter `type`. Any note can,
 * not only the one records are added to, so an archived month is coloured too.
 */
function isTimeRecordNote(app: App, file: TFile): boolean {
    return noteType(app, file) === TIME_RECORD_TYPE;
}

/**
 * Colour the time each record opens with by the hour it falls in, in notes of
 * type "tijdsregistratie": in the editor and in reading mode. The colours are
 * in `styles.css`.
 *
 * The type is read from the metadata cache on each check, so a note picks up
 * a new type on its next edit.
 */
export function registerTimeHeatmap(plugin: Plugin): void {
    const applies = (file: TFile) => isTimeRecordNote(plugin.app, file);

    plugin.registerEditorExtension(
        lineMarker(applies, (text) => {
            const time = lineRecordTime(text);
            return time && { from: time.from, to: time.to, cls: heatClasses(time.hour) };
        }),
    );
    plugin.registerMarkdownPostProcessor(heatmapPostProcessor(plugin.app, applies));
}
