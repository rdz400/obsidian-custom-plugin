import { App, Editor, MarkdownView, Notice, TFile } from 'obsidian';

import { formatDate } from './shared/date';
import { NoteSuggestModal, StringSuggestModal } from './shared/ui/modals';

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
        return fm.status !== 'klaar' && fm.status !== 'geannuleerd';
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

/** Project statuses, in Dutch. */
const PROJECT_STATUSES = ['actief', 'klaar', 'backlog', 'misschien', 'geannuleerd'];

/** Statuses that mark a project as finished; these set the `eind` date. */
const PROJECT_CLOSED_STATUSES = ['klaar', 'geannuleerd'];

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
        return fm.status !== 'klaar' && fm.status !== 'geannuleerd';
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
            fm.eind = PROJECT_CLOSED_STATUSES.includes(status)
                ? formatDate(new Date(), 'YYYY-MM-DD')
                : null;
        });
        new Notice(`Set status to ${status}`);
    }).open();
}
