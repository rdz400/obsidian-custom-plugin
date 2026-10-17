import { App, TFile, normalizePath } from 'obsidian';

/** Folder configured in the core "Templates" plugin, or null if unset/disabled. */
export function getTemplatesFolder(app: App): string | null {
    const instance = (app as any).internalPlugins?.getPluginById('templates')?.instance;
    const folder = instance?.options?.folder;
    return typeof folder === 'string' && folder.length > 0 ? normalizePath(folder) : null;
}

/** Append `text` to the end of `file`, on lines of its own. */
export async function appendToNote(app: App, file: TFile, text: string): Promise<void> {
    await app.vault.process(file, (content) => {
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        return content + separator + text + '\n';
    });
}
