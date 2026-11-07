import type { Plugin, TFile } from 'obsidian';

import { lineMarker } from '../../shared/editor/linemarks';
import { lineRecordTime } from '../recordline';
import { isTimeRecordNote } from '../timerecordnote';
import { heatClasses } from './heatmap';
import { heatmapPostProcessor } from './postprocessor';

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
