import { App, TFile, normalizePath } from 'obsidian';

/** Folder configured in the core "Templates" plugin, or null if unset/disabled. */
function getTemplatesFolder(app: App): string | null {
    const instance = (app as any).internalPlugins?.getPluginById('templates')?.instance;
    const folder = instance?.options?.folder;
    return typeof folder === 'string' && folder.length > 0 ? normalizePath(folder) : null;
}

/**
 * A test for whether a file is a template: whether it sits in the folder of the
 * core "Templates" plugin. Nothing is a template when that folder is not set.
 *
 * Returns the test rather than taking a file, so a pass over the whole vault
 * looks the folder up once instead of once per file.
 */
export function templateMatcher(app: App): (file: TFile) => boolean {
    const folder = getTemplatesFolder(app);
    if (folder === null) return () => false;
    return (file) => file.path === folder || file.path.startsWith(`${folder}/`);
}

/**
 * Append `text` to the end of `file`, on lines of its own. Returns what was
 * added to the note, newlines and all, so it can be taken out again exactly.
 */
export async function appendToNote(app: App, file: TFile, text: string): Promise<string> {
    let added = '';
    await app.vault.process(file, (content) => {
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        added = separator + text + '\n';
        return content + added;
    });
    return added;
}
