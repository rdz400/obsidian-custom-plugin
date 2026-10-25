import { listLines } from '../../shared/taskline';
import type { TaskNoteLines } from '../../shared/tasknotes';
import { cacheOf, testFile } from '../../shared/testcache';
import { noteTaskItems, type TaskItem } from '../taskitems';
import type { GtdId } from './draft';

/**
 * For tests only: task notes read from their text, as the manager reads
 * them when it opens. Notes are given as `{ path: text }`; a note is a GTD
 * note when its basename is one of the GTD ids ("today", "inbox", …).
 */
export interface TestNotes {
    notes: TaskNoteLines[];
    tasks: TaskItem[];
    targets: Map<GtdId, string>;
}

const GTD_IDS: readonly GtdId[] = ['today', 'someday', 'overview', 'inbox'];

export function notesOf(texts: Record<string, string>): TestNotes {
    const notes: TaskNoteLines[] = [];
    const tasks: TaskItem[] = [];
    const targets = new Map<GtdId, string>();

    for (const [path, text] of Object.entries(texts)) {
        const file = testFile(path);
        const gtd = GTD_IDS.find((id) => id === file.basename);
        if (gtd) targets.set(gtd, path);
        const lines = listLines(cacheOf(text).listItems, text.split('\n'));
        notes.push({ file, text, lines });
        tasks.push(...noteTaskItems(file, { letter: file.basename.charAt(0), label: file.basename }, gtd, lines));
    }

    return { notes, tasks, targets };
}

/** The index of the task whose text is `text`. */
export function taskIndex(tasks: readonly TaskItem[], text: string): number {
    const index = tasks.findIndex((task) => task.text === text);
    if (index === -1) throw new Error(`No task "${text}"`);
    return index;
}
