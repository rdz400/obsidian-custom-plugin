import {
    Editor,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
    debounce,
} from 'obsidian';

import {
    moveLinesToEnd,
    toggleTag,
    moveLinesToNote,
    toggleCheckBoxAdvanced,
    openTaakBestanden,
    moveFinishedTasksToKlaar,
    moveTakenNotesToFolder,
    moveProjectNotesToFolder,
    insertProjectLink,
    insertTag,
    addProjectToFrontmatter,
    setStatusInFrontmatter,
    mergeTakenNotes,
    openMostRecentTaakNote,
} from './commands';

export default class RonaldPlugin extends Plugin {

    async onload() {


        this.addCommand({
            id: 'playing',
            name: 'Playing ',
            icon: 'flask-conical',
            editorCallback: (editor, view) => {
                if (!view.file) return;
                console.log("Hello world");

                const files = this.app.vault.getMarkdownFiles();
                const filtered = files.map((file, index) => {return file.basename});
                const content = filtered.join('\n');

            },
        });


        const openProjecten = async () => {
            const projecten = this.app.vault.getFileByPath(
                '0-werkruimte/bases/projecten.base',
            );
            if (!projecten) {
                new Notice('Note "projecten" not found');
                return;
            }
            const leaf =
                this.app.workspace.getMostRecentLeaf(
                    this.app.workspace.rootSplit,
                ) ?? this.app.workspace.getLeaf(false);
            await leaf.openFile(projecten);
        };

        this.addCommand({
            'id': 'open-projecten',
            name: 'Open projecten',
            icon: 'folder-open',
            callback: openProjecten,
        })

        this.addRibbonIcon('folder-open', 'Open projecten', openProjecten);

        const openNoteByName = async (name: string) => {
            const note = this.app.metadataCache.getFirstLinkpathDest(name, '');
            if (!note) {
                new Notice(`Note "${name}" not found`);
                return;
            }
            const leaf =
                this.app.workspace.getMostRecentLeaf(
                    this.app.workspace.rootSplit,
                ) ?? this.app.workspace.getLeaf(false);
            await leaf.openFile(note);
        };

        this.addCommand({
            id: 'open-klaar',
            name: 'Open klaar',
            icon: 'check-check',
            callback: () => openNoteByName('klaar'),
        });

        this.addCommand({
            id: 'open-inbox',
            name: 'Open inbox',
            icon: 'inbox',
            callback: () => openNoteByName('inbox'),
        });

        this.addRibbonIcon('check-check', 'Open klaar', () => openNoteByName('klaar'));
        this.addRibbonIcon('inbox', 'Open inbox', () => openNoteByName('inbox'));

        this.addCommand({
            id: 'open-taken',
            name: 'Open taken',
            icon: 'list-checks',
            callback: () => openTaakBestanden(this.app),
        });

        this.addCommand({
            id: 'move-lines-to-end',
            name: 'Move line(s) to end of file',
            icon: 'chevrons-down',
            editorCallback: (editor: Editor) => moveLinesToEnd(editor),
        });

        for (const tag of ['nu', 'misschien', 'vandaag']) {
            this.addCommand({
                id: `toggle-${tag}-tag`,
                name: `Toggle #${tag} tag`,
                icon: 'hash',
                editorCallback: (editor: Editor) => toggleTag(editor, tag),
            });
        }

        this.addCommand({
            id: 'move-lines-to-note',
            name: 'Move line(s) to another note',
            icon: 'file-output',
            editorCallback: (editor: Editor) => moveLinesToNote(this.app, editor),
        });

        this.addCommand({
            id: 'toggle-checkbox-advanced',
            name: 'Toggle checkbox status advanced',
            icon: 'square-check-big',
            editorCallback: (editor: Editor) => toggleCheckBoxAdvanced(editor),
        });

        this.addCommand({
            id: 'move-finished-tasks-to-klaar',
            name: 'Move finished tasks to "klaar"',
            icon: 'check-check',
            callback: () => moveFinishedTasksToKlaar(this.app),
        });

        this.addCommand({
            id: 'move-taken-notes-to-folder',
            name: 'Move "taken" notes to 1-taken folder',
            icon: 'folder-input',
            callback: () => moveTakenNotesToFolder(this.app),
        });

        this.addCommand({
            id: 'move-project-notes-to-folder',
            name: 'Move "project" notes to 1-projecten folder',
            icon: 'folder-input',
            callback: () => moveProjectNotesToFolder(this.app),
        });

        this.addCommand({
            id: 'insert-project-link',
            name: 'Insert link to active project',
            icon: 'link',
            editorCallback: (editor: Editor) => insertProjectLink(this.app, editor),
        });

        this.addCommand({
            id: 'insert-tag',
            name: 'Insert tag at end of line',
            icon: 'tag',
            editorCallback: (editor: Editor) => insertTag(this.app, editor),
        });

        this.addCommand({
            id: 'add-project-to-frontmatter',
            name: 'Add project to frontmatter',
            icon: 'folder-plus',
            callback: () => addProjectToFrontmatter(this.app),
        });

        this.addCommand({
            id: 'set-status-in-frontmatter',
            name: 'Set project status in frontmatter',
            icon: 'circle-dot',
            callback: () => setStatusInFrontmatter(this.app),
        });

        this.addCommand({
            id: 'merge-taken-notes',
            name: 'Merge "taken" notes into one note',
            icon: 'merge',
            callback: () => mergeTakenNotes(this.app),
        });

        this.addCommand({
            id: 'open-most-recent-taak-note',
            name: 'Open most recent "taken" note',
            icon: 'clock',
            callback: () => openMostRecentTaakNote(this.app),
        });

        this.addRibbonIcon('clock', 'Open most recent "taken" note', () => openMostRecentTaakNote(this.app));

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
