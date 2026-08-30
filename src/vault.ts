import { App, normalizePath } from 'obsidian';

/** Folder configured in the core "Templates" plugin, or null if unset/disabled. */
export function getTemplatesFolder(app: App): string | null {
    const instance = (app as any).internalPlugins?.getPluginById('templates')?.instance;
    const folder = instance?.options?.folder;
    return typeof folder === 'string' && folder.length > 0 ? normalizePath(folder) : null;
}
