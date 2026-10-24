import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import { searchTasks } from '../tasks/search';
import {
    addProjectToFrontmatter,
    insertProjectLink,
    moveProjectNotesToFolder,
    openProjects,
    setStatusInFrontmatter,
} from './commands';
import { searchProjects, type ProjectSearchOptions } from './search';
import { registerProjectsUriHandler } from './urihandler';

/**
 * Everything for projects: opening and searching them, linking to them, and
 * setting a note's project and status.
 */
export function registerProjectFeatures(plugin: RonaldPlugin): void {
    plugin.addCommand({
        id: 'open-projecten',
        name: 'Open projecten',
        icon: 'folder-open',
        callback: () => openProjects(plugin.app),
    });

    plugin.addRibbonIcon('folder-open', 'Open projecten', () => openProjects(plugin.app));

    plugin.addCommand({
        id: 'move-project-notes-to-folder',
        name: 'Move "project" notes to 1-projecten folder',
        icon: 'folder-input',
        callback: () => moveProjectNotesToFolder(plugin.app),
    });

    plugin.addCommand({
        id: 'insert-project-link',
        name: 'Insert link to active project',
        icon: 'link',
        editorCallback: (editor: Editor) => insertProjectLink(plugin.app, editor),
    });

    plugin.addCommand({
        id: 'add-project-to-frontmatter',
        name: 'Add project to frontmatter',
        icon: 'folder-plus',
        callback: () => addProjectToFrontmatter(plugin.app),
    });

    plugin.addCommand({
        id: 'set-status-in-frontmatter',
        name: 'Set project status in frontmatter',
        icon: 'circle-dot',
        callback: () => setStatusInFrontmatter(plugin.app),
    });

    /**
     * How the project search behaves wherever it is opened from: Shift+Enter
     * hands the chosen project's name to the task search as its query.
     *
     * Built per call rather than once, so the task chips it closes over are the
     * ones in the settings at that moment — a tag added in settings reaches the
     * next search without a reload.
     */
    const searchOptions = (): ProjectSearchOptions => ({
        onSearchTasks: (name) => void searchTasks(plugin.app, plugin.settings, { query: name }),
    });

    const search = () =>
        searchProjects(plugin.app, plugin.settings.taskFolder, searchOptions());

    plugin.addCommand({
        id: 'search-projects',
        name: 'Search projects',
        icon: 'search',
        callback: () => void search(),
    });

    plugin.addRibbonIcon('search', 'Search projects', () => void search());

    registerProjectsUriHandler(plugin, () => plugin.settings.taskFolder, searchOptions);
}
