import {
    Editor,
    Notice,
    Plugin,
    TFile,
    WorkspaceLeaf,
} from 'obsidian';

import { copyWikilink } from './links/copywikilink';
import { applyNamingConvention } from './naming/renamefiles';
import { searchBacklinks } from './search/backlinksearch';
import {
    moveProjectNotesToFolder,
    insertProjectLink,
    addProjectToFrontmatter,
    setStatusInFrontmatter,
} from './commands';
import {
    extendSelectionByLine,
    moveLinesToEnd,
    moveLinesToNote,
    moveLinesToTop,
    selectLine,
} from './editing/linecommands';
import { searchOutgoingLinks } from './search/outgoinglinksearch';
import { showOutline } from './search/outlinesearch';
import { searchProjects, type ProjectSearchOptions } from './search/projectsearch';
import { showRecentNotes } from './search/recentnotes';
import { addTimeRecord } from './timerecord/addtimerecord';
import { openTimeRecordNote } from './timerecord/timerecordnote';
import {
    DEFAULT_SETTINGS,
    RonaldSettingTab,
    type RonaldSettings,
} from './settings';
import { registerTaskFeatures } from './tasks';
import { searchTasks } from './tasks/search';
import { TabRecency } from './tabs/tabrecency';
import { showTabSwitcher } from './tabs/tabswitcher';
import {
    registerProjectsUriHandler,
    registerTijdsregistratieUriHandler,
    registerTimeRecordUriHandler,
} from './urihandler';

export default class RonaldPlugin extends Plugin {
    settings!: RonaldSettings;
    private readonly tabRecency = new TabRecency();

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

        this.addCommand({
            id: 'move-lines-to-note',
            name: 'Move line(s) to another note',
            icon: 'file-output',
            editorCallback: (editor: Editor) => moveLinesToNote(this.app, editor),
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
            id: 'open-tijdsregistratie-note',
            name: 'Open "tijdsregistratie" note',
            icon: 'timer',
            callback: () => void openTimeRecordNote(this.app),
        });

        this.addCommand({
            id: 'add-time-record',
            name: 'Add time record to "tijdsregistratie" note',
            icon: 'timer',
            callback: () => addTimeRecord(this.app),
        });

        this.addRibbonIcon('timer', 'Add time record', () => addTimeRecord(this.app));

        this.addCommand({
            id: 'search-projects',
            name: 'Search projects',
            icon: 'search',
            callback: () => void this.searchProjects(),
        });

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
            id: 'copy-wikilink-to-this-note',
            name: 'Copy wikilink to this note',
            icon: 'link-2',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (!file) return false;
                if (!checking) void copyWikilink(this.app, file);
                return true;
            },
        });

        this.addCommand({
            id: 'apply-naming-convention',
            name: 'Apply naming convention to files in a folder',
            icon: 'file-pen',
            callback: () => applyNamingConvention(this.app),
        });

        this.addCommand({
            id: 'show-outline',
            name: 'Show outline of this note',
            icon: 'list',
            callback: () => showOutline(this.app),
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

        // Recorded from load on, so the switcher can list recent tabs first.
        this.tabRecency.register(this);

        this.addCommand({
            id: 'switch-to-open-tab',
            name: 'Switch to open tab',
            icon: 'panels-top-left',
            callback: () => showTabSwitcher(this.app, this.tabRecency),
        });

        registerTaskFeatures(this, this.tabRecency);

        registerProjectsUriHandler(
            this,
            () => this.settings.taskFolder,
            () => this.projectSearchOptions(),
        );
        registerTijdsregistratieUriHandler(this);
        registerTimeRecordUriHandler(this);
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
                void searchTasks(this.app, this.settings, { query: name }),
        };
    }

    /** Open the project search from the command or the ribbon. */
    private searchProjects(): Promise<void> {
        return searchProjects(
            this.app,
            this.settings.taskFolder,
            this.projectSearchOptions(),
        );
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
}
