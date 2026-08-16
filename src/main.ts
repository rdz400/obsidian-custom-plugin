import {
    Editor,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
    WorkspaceLeaf,
    debounce,
} from 'obsidian';

import { searchBacklinks } from './backlinksearch';
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
    removeTagFromTakenNotes,
} from './commands';
import {
    extendSelectionByLine,
    moveLinesToTop,
    selectLine,
} from './editorcommands';
import { searchOutgoingLinks } from './outgoinglinksearch';
import { searchProjects, type ProjectSearchOptions } from './projectsearch';
import { showRecentNotes } from './recentnotes';
import {
    DEFAULT_SETTINGS,
    RonaldSettingTab,
    type RonaldSettings,
} from './settings';
import { searchTasks } from './tasksearch';
import { registerProjectsUriHandler, registerTasksUriHandler } from './urihandler';

export default class RonaldPlugin extends Plugin {
    settings!: RonaldSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new RonaldSettingTab(this.app, this));


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

            let existing: WorkspaceLeaf | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                const file = (leaf.view as { file?: TFile }).file;
                if (file?.path === projecten.path) {
                    existing = leaf;
                }
            });
            if (existing) {
                await this.app.workspace.revealLeaf(existing);
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

        this.addCommand({
            id: 'select-line',
            name: 'Select whole line',
            icon: 'text-cursor-input',
            editorCallback: (editor: Editor) => selectLine(editor),
        });

        this.addCommand({
            id: 'extend-selection-line-up',
            name: 'Extend selection to line above',
            icon: 'chevron-up',
            editorCallback: (editor: Editor) => extendSelectionByLine(editor, -1),
        });

        this.addCommand({
            id: 'extend-selection-line-down',
            name: 'Extend selection to line below',
            icon: 'chevron-down',
            editorCallback: (editor: Editor) => extendSelectionByLine(editor, 1),
        });

        this.addCommand({
            id: 'move-lines-to-top',
            name: 'Move line(s) to top of file',
            icon: 'chevrons-up',
            editorCallback: (editor: Editor) => moveLinesToTop(editor),
        });

        for (const tag of ['nu', 'misschien', 'vandaag']) {
            this.addCommand({
                id: `toggle-${tag}-tag`,
                name: `Toggle #${tag} tag`,
                icon: 'hash',
                editorCallback: (editor: Editor) => toggleTag(editor, tag),
            });
        }

        // One command per tag rather than one command that asks which tag: this
        // way each can carry its own hotkey. Reading the list at load means an
        // added tag needs a reload, which the setting's description says.
        for (const tag of this.settings.clearTags) {
            if (tag.length === 0) continue;
            this.addCommand({
                id: `remove-${tag}-tag-from-taken-notes`,
                name: `Remove #${tag} tag from all "taken" notes`,
                icon: 'eraser',
                callback: () => void removeTagFromTakenNotes(this.app, tag),
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
            editorCallback: (editor: Editor) =>
                insertTag(this.app, editor, this.settings.insertTags),
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

        this.addCommand({
            id: 'search-projects',
            name: 'Search projects',
            icon: 'search',
            callback: () => void this.searchProjects(),
        });

        this.addCommand({
            id: 'search-tasks',
            name: 'Search tasks',
            icon: 'list-checks',
            callback: () => void searchTasks(this.app, this.settings.taskFilterTags),
        });

        this.addRibbonIcon('list-checks', 'Search tasks', () =>
            void searchTasks(this.app, this.settings.taskFilterTags),
        );

        this.addRibbonIcon('search', 'Search projects', () => void this.searchProjects());

        this.addCommand({
            id: 'search-backlinks',
            name: 'Search notes linking to this note',
            icon: 'link',
            // The types come from the settings and are read here rather than
            // captured, so a type added in settings reaches the next search
            // without a reload.
            callback: () => searchBacklinks(this.app, this.settings.linkNoteTypes),
        });

        this.addCommand({
            id: 'search-outgoing-links',
            name: 'Search links in this note',
            icon: 'external-link',
            callback: () =>
                void searchOutgoingLinks(this.app, this.settings.linkNoteTypes),
        });

        this.addCommand({
            id: 'show-recent-notes',
            name: 'Show recently created notes',
            icon: 'calendar-clock',
            // Like the link searches, the settings are read here rather than
            // captured, so a type or folder added in settings reaches the next
            // run without a reload.
            callback: () => this.showRecentNotes(),
        });

        this.addRibbonIcon('calendar-clock', 'Show recently created notes', () =>
            this.showRecentNotes(),
        );

        registerTasksUriHandler(this, () => this.settings.taskFilterTags);
        registerProjectsUriHandler(this, () => this.projectSearchOptions());

        this.registerStatusBar();
    }

    onunload() {}

    /**
     * How the project search behaves wherever it is opened from: Shift+Enter
     * hands the chosen project's name to the task search as its query.
     *
     * Built per call rather than once, so the task chips it closes over are the
     * ones in the settings at that moment — a tag added in settings reaches the
     * next search without a reload.
     */
    private projectSearchOptions(): ProjectSearchOptions {
        return {
            onSearchTasks: (name) =>
                void searchTasks(this.app, this.settings.taskFilterTags, {
                    query: name,
                }),
        };
    }

    /** Open the project search from the command or the ribbon. */
    private searchProjects(): Promise<void> {
        return searchProjects(this.app, this.projectSearchOptions());
    }

    /** Open the recent notes list from the command or the ribbon. */
    private showRecentNotes(): void {
        showRecentNotes(
            this.app,
            this.settings.linkNoteTypes,
            this.settings.recentFolders,
        );
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<RonaldSettings>,
        );
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

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
