import type { Editor } from 'obsidian';

import type RonaldPlugin from '../main';
import {
    addProjectToFrontmatter,
    insertProjectLink,
    moveProjectNotesToFolder,
    openProjects,
    setStatusInFrontmatter,
} from './commands';
import { searchProjects } from './search';
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

    const search = () => searchProjects(plugin.app, plugin.settings.taskFolder);

    plugin.addCommand({
        id: 'search-projects',
        name: 'Search projects',
        icon: 'search',
        callback: () => void search(),
    });

    plugin.addRibbonIcon('search', 'Search projects', () => void search());

    registerProjectsUriHandler(plugin, () => plugin.settings.taskFolder);
}
