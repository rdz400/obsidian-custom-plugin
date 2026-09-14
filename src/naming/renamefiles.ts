import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';

import { conventionalName, followsConvention } from './convention';
import { FolderSuggestModal } from './foldermodal';
import { ConfirmRenameModal } from './confirmmodal';

/** One file to rename, and the name the convention gives it. */
export interface PlannedRename {
    file: TFile;
    from: string;
    to: string;
}

/**
 * The renames the convention asks for in `folder`, immediate children only.
 *
 * Subfolders are left out: a folder is the unit the user picked, and recursing
 * would rename notes they cannot see from the picker. Files already in
 * convention, and files the convention has no name for, are skipped.
 *
 * Where two files would land on the same name, the later ones get a `-2`, `-3`
 * suffix rather than colliding — the vault's own occupied names count too, so a
 * rename never overwrites a note that is merely not in the plan.
 */
export function planRenames(folder: TFolder): PlannedRename[] {
    const files = folder.children
        .filter((child): child is TFile => child instanceof TFile)
        .sort((a, b) => a.name.localeCompare(b.name));

    const taken = new Set(
        files.map((file) => `${file.basename}.${file.extension}`.toLowerCase()),
    );
    const plan: PlannedRename[] = [];

    for (const file of files) {
        if (followsConvention(file.basename)) continue;

        const base = conventionalName(file.basename, new Date(file.stat.ctime));
        if (base === null) continue;

        const current = `${file.basename}.${file.extension}`.toLowerCase();
        taken.delete(current);

        let candidate = `${base}.${file.extension}`;
        for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
            candidate = `${base}-${n}.${file.extension}`;
        }
        taken.add(candidate.toLowerCase());

        if (candidate === `${file.basename}.${file.extension}`) continue;
        plan.push({ file, from: file.name, to: candidate });
    }

    return plan;
}

/**
 * Apply `plan`, renaming through the file manager so links to these notes are
 * rewritten with them.
 *
 * One failure does not stop the rest: the files are independent, and a single
 * name the vault refuses is no reason to leave the others untouched. Whatever
 * failed is reported at the end.
 */
async function applyRenames(app: App, plan: readonly PlannedRename[]): Promise<void> {
    const failures: string[] = [];

    for (const { file, from, to } of plan) {
        const target = normalizePath(
            file.parent && !file.parent.isRoot() ? `${file.parent.path}/${to}` : to,
        );
        try {
            await app.fileManager.renameFile(file, target);
        } catch (error) {
            console.error(`Could not rename "${from}" to "${to}"`, error);
            failures.push(from);
        }
    }

    const renamed = plan.length - failures.length;
    if (failures.length === 0) {
        new Notice(`Renamed ${renamed} file${renamed === 1 ? '' : 's'}`);
        return;
    }

    new Notice(
        `Renamed ${renamed} of ${plan.length} files. Could not rename: ${failures.join(', ')}`,
    );
}

/**
 * Ask for a folder, then bring its files in line with the naming convention.
 *
 * The plan is shown for confirmation before anything is written: a rename
 * touches every link to the note, so it is not something to discover after the
 * fact.
 */
export function applyNamingConvention(app: App): void {
    new FolderSuggestModal(app, (folder) => {
        const plan = planRenames(folder);
        const where = folder.isRoot() ? 'the vault root' : `"${folder.path}"`;

        if (plan.length === 0) {
            new Notice(`Nothing to rename in ${where}`);
            return;
        }

        new ConfirmRenameModal(app, folder, plan, () => void applyRenames(app, plan)).open();
    }).open();
}
