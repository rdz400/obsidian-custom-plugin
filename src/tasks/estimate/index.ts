import type { TFile } from 'obsidian';

import type RonaldPlugin from '../../main';
import { lineMarker } from '../../shared/editor/linemarks';
import { isTaskNote } from '../../shared/tasknotes';
import { ESTIMATE_CLASS, lineEstimate } from './estimate';
import { estimatePostProcessor } from './postprocessor';
import { registerEstimateTotal } from './statusbar';

/**
 * Time estimates ("\20" for twenty minutes) on tasks in task notes: coloured
 * in the editor and in reading mode, and added up in the status bar.
 *
 * The task folder is read from settings on each check, so changing it needs
 * no reload; an open note picks it up on its next edit.
 */
export function registerEstimates(plugin: RonaldPlugin): void {
    const applies = (file: TFile) => isTaskNote(file, plugin.settings.taskFolder);

    plugin.registerEditorExtension(
        lineMarker(applies, (text) => {
            const estimate = lineEstimate(text);
            return estimate && { from: estimate.from, to: estimate.to, cls: ESTIMATE_CLASS };
        }),
    );
    plugin.registerMarkdownPostProcessor(estimatePostProcessor(plugin.app, applies));
    registerEstimateTotal(plugin, applies);
}
