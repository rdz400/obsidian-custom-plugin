import { App, Editor, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

import { formatDate } from '../shared/date';
import { NoteSuggestModal, StringSuggestModal } from '../shared/ui/modals';
import { CLOSED_PROJECT_STATUSES, isOpenStatus, PROJECT_STATUSES } from './statuses';

/** The base listing the projects, opened by "Open projecten". */
const PROJECTS_BASE = '0-werkruimte/bases/projecten.base';

/**
 * Open the projects base: reveal the tab already showing it, or open it in the
 * most recent tab of the main area.
 */
export async function openProjects(app: App): Promise<void> {
    const projecten = app.vault.getFileByPath(PROJECTS_BASE);
    if (!projecten) {
        new Notice('Note "projecten" not found');
        return;
    }

    let existing: WorkspaceLeaf | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
        const file = (leaf.view as { file?: TFile }).file;
        if (file?.path === projecten.path) {
            existing = leaf;
        }
    });
    if (existing) {
        await app.workspace.revealLeaf(existing);
        return;
    }

    const leaf =
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
    await leaf.openFile(projecten);
}

/** Move every note in "0-inbox" whose frontmatter `type` is "project" into "1-projecten". */
export async function moveProjectNotesToFolder(app: App): Promise<void> {
    const sourceFolder = '0-inbox';
    const targetFolder = '1-projecten';

    if (!app.vault.getFolderByPath(targetFolder)) {
        await app.vault.createFolder(targetFolder);
    }

    const files = app.vault.getMarkdownFiles().filter((file) => {
        if (!file.path.startsWith(`${sourceFolder}/`)) return false;
        const cache = app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.type === 'project';
    });

    let moved = 0;
    for (const file of files) {
        const dest = `${targetFolder}/${file.name}`;
        if (app.vault.getAbstractFileByPath(dest)) {
            new Notice(`Skipped "${file.name}": already exists in ${targetFolder}`);
            continue;
        }
        await app.fileManager.renameFile(file, dest);
        moved++;
    }

    new Notice(`Moved ${moved} note(s) to ${targetFolder}`);
}

/** Insert an internal link to a chosen active project at the cursor via a fuzzy-search modal. */
export function insertProjectLink(app: App, editor: Editor): void {
    const projects = app.vault.getMarkdownFiles().filter((file) => {
        const fm = app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== 'project') return false;
        return isOpenStatus(fm.status);
    });

    new NoteSuggestModal(
        app,
        (file: TFile) => {
            const link = app.fileManager.generateMarkdownLink(file, file.path);
            editor.replaceSelection(link);
        },
        projects,
    ).open();
}

/**
 * Pick an active project via a fuzzy-search modal and append a link to it to the
 * active note's `project` frontmatter list.
 */
export function addProjectToFrontmatter(app: App): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
        new Notice('No active note');
        return;
    }
    const file = view.file;

    const projects = app.vault.getMarkdownFiles().filter((f) => {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (fm?.type !== 'project') return false;
        return isOpenStatus(fm.status);
    });

    new NoteSuggestModal(
        app,
        (project: TFile) => {
            const link = app.fileManager.generateMarkdownLink(project, file.path);
            app.fileManager.processFrontMatter(file, (fm) => {
                const current = fm.project;
                const list = Array.isArray(current)
                    ? current
                    : current != null
                        ? [current]
                        : [];
                if (!list.includes(link)) list.push(link);
                fm.project = list;
            });
            new Notice(`Added project ${project.basename}`);
        },
        projects,
    ).open();
}

/**
 * Pick a project status via a modal and set it as the active note's `status`
 * frontmatter field.
 */
export function setStatusInFrontmatter(app: App): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
        new Notice('No active note');
        return;
    }
    const file = view.file;

    new StringSuggestModal(app, PROJECT_STATUSES, (status: string) => {
        app.fileManager.processFrontMatter(file, (fm) => {
            fm.status = status;
            // Closed projects get today as their end date; reopening clears it.
            fm.eind = CLOSED_PROJECT_STATUSES.includes(status)
                ? formatDate(new Date(), 'YYYY-MM-DD')
                : null;
        });
        new Notice(`Set status to ${status}`);
    }).open();
}
