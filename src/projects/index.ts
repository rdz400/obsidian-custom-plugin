/**
 * Projects
 * ========
 *
 * A project is a note with `type: project` in its frontmatter and a `status`:
 * actief, backlog, wachten, misschien, klaar or geannuleerd. A project is open
 * until its status is klaar or geannuleerd. Other notes say which project they
 * belong to in a `project` frontmatter list of links.
 *
 * How to use it
 * -------------
 * - "Search projects" (also a ribbon icon) lists the open projects, actief
 *   first, each with its status and how many open tasks link to it. A task
 *   counts for a project when it, or a list item it hangs under, links to the
 *   project, also with a display text ([[project|tekst]]) or as a path. The
 *   chips filter on status and on whether a project has open
 *   tasks. Enter opens the project, Mod+Enter in a new tab, and Alt+Enter
 *   copies a link to it and inserts it at the cursor.
 * - obsidian://ronald-projects?query=tuin&status=actief,wachten&tasks=met
 *   opens the same search from a link; tasks=zonder shows projects without
 *   open tasks. Every parameter is optional.
 * - "Open projecten" (also a ribbon icon) opens the projects base,
 *   0-werkruimte/bases/projecten.base.
 * - "Insert link to active project" inserts a link to an open project at the
 *   cursor; "Add project to frontmatter" adds one to the note's `project` list.
 * - "Set project status in frontmatter" sets `status`; klaar and geannuleerd
 *   also set `eind` to today, and another status clears it.
 * - "Move "project" notes to 1-projecten folder" moves the project notes in
 *   0-inbox to 1-projecten.
 *
 * The open task counts read the task notes in the task folder from the task
 * settings. Projects have no settings of their own.
 *
 * Where the code is
 * -----------------
 * - search.ts      the project search and its task counts
 * - commands.ts    the other project commands
 * - statuses.ts    the statuses and which ones close a project
 * - urihandler.ts  obsidian://ronald-projects
 */

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

/** Register the project features. */
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
