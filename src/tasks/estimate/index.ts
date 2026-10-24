import type { TFile } from 'obsidian';

import type RonaldPlugin from '../../main';
import { isTaskNote } from '../tasknotes';
import { estimateHighlighter } from './editorextension';
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

    plugin.registerEditorExtension(estimateHighlighter(applies));
    plugin.registerMarkdownPostProcessor(estimatePostProcessor(plugin.app, applies));
    registerEstimateTotal(plugin, applies);
}
