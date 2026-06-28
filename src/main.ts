import {
    Editor,
    MarkdownView,
    Plugin,
    debounce,
} from 'obsidian';

import {
    moveLinesToEnd,
    toggleNuTag,
    moveLinesToNote,
    toggleCheckBoxAdvanced,
    openTaakBestanden,
	getMyCache,
    moveFinishedTasksToKlaar,
    moveTakenNotesToFolder,
} from './commands';

export default class RonaldPlugin extends Plugin {

    async onload() {
        this.addCommand({
            id: 'test-cache',
            name: 'Test cache',
            callback: () => getMyCache(this.app),
        });

        this.addCommand({
            id: 'open-taken',
            name: 'Open taken',
            callback: () => openTaakBestanden(this.app),
        });

        this.addCommand({
            id: 'move-lines-to-end',
            name: 'Move line(s) to end of file',
            editorCallback: (editor: Editor) => moveLinesToEnd(editor),
        });

        this.addCommand({
            id: 'toggle-nu-tag',
            name: 'Toggle #nu tag',
            editorCallback: (editor: Editor) => toggleNuTag(editor),
        });

        this.addCommand({
            id: 'move-lines-to-note',
            name: 'Move line(s) to another note',
            editorCallback: (editor: Editor) => moveLinesToNote(this.app, editor),
        });

        this.addCommand({
            id: 'toggle-checkbox-advanced',
            name: 'Toggle checkbox status advanced',
            editorCallback: (editor: Editor) => toggleCheckBoxAdvanced(editor),
        });

        this.addCommand({
            id: 'move-finished-tasks-to-klaar',
            name: 'Move finished tasks to "klaar"',
            callback: () => moveFinishedTasksToKlaar(this.app),
        });

        this.addCommand({
            id: 'move-taken-notes-to-folder',
            name: 'Move "taken" notes to 1-taken folder',
            callback: () => moveTakenNotesToFolder(this.app),
        });

        this.registerStatusBar();
    }

    onunload() {}

    /** Show the number of tasks in the active note in the status bar. */
    private registerStatusBar(): void {
        const statusBarItemEl = this.addStatusBarItem();

        const updateTaskCount = (editor: Editor) => {
            const tasks = editor
                .getValue()
                .split('\n')
                .filter((line) => /^\s*[-*]\s+\[[ xX]\]/.test(line));
            statusBarItemEl.setText(String(tasks.length));
        };

        const onChangeDebounced = debounce(updateTaskCount, 300);

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                onChangeDebounced(editor);
            })
        );

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    updateTaskCount(view.editor);
                } else {
                    statusBarItemEl.setText('');
                }
            })
        );
    }
}
