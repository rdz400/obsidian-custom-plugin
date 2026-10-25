import { App, CachedMetadata, TFile, normalizePath } from 'obsidian';

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

/** How long to wait for Obsidian to re-parse a note after saving it. */
const PARSE_TIMEOUT_MS = 3000;

/**
 * Resolve with the cache Obsidian builds from exactly `text`, or `null` when
 * that doesn't happen within the timeout. Call it before writing `text`, so a
 * fast parse can't slip past.
 *
 * The `changed` event passes the content it parsed, so comparing it with
 * `text` tells this parse apart from one of an older version.
 */
export function parsedCache(app: App, file: TFile, text: string): Promise<CachedMetadata | null> {
    return new Promise((resolve) => {
        const finish = (cache: CachedMetadata | null) => {
            app.metadataCache.offref(ref);
            window.clearTimeout(timer);
            resolve(cache);
        };
        const ref = app.metadataCache.on('changed', (changed, data, cache) => {
            if (changed.path === file.path && data === text) finish(cache);
        });
        const timer = window.setTimeout(() => finish(null), PARSE_TIMEOUT_MS);
    });
}

/**
 * `vault.process` on `file` with `fn`, resolving once the metadata cache has
 * parsed what was written: with that cache, or `null` when the parse doesn't
 * come within the timeout. When `fn` leaves the text as it was, there is no
 * new parse to wait for, and the current cache is returned straight away.
 */
export async function processAndParse(
    app: App,
    file: TFile,
    fn: (data: string) => string,
): Promise<CachedMetadata | null> {
    let parsed: Promise<CachedMetadata | null> | undefined;
    await app.vault.process(file, (data) => {
        const text = fn(data);
        // Obsidian writes once this returns, so the listener is there first.
        if (text !== data) parsed = parsedCache(app, file, text);
        return text;
    });
    return parsed ?? app.metadataCache.getFileCache(file);
}
