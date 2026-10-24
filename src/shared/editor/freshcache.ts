import { App, CachedMetadata, TFile } from 'obsidian';

/** How long to wait for Obsidian to re-parse a note after saving it. */
const PARSE_TIMEOUT_MS = 3000;

/**
 * Resolve with the cache Obsidian builds from exactly `text`, or `null` when
 * that doesn't happen within the timeout.
 *
 * The `changed` event passes the content it parsed, so comparing it with
 * `text` tells this parse apart from one of an older version.
 */
function parsedCache(app: App, file: TFile, text: string): Promise<CachedMetadata | null> {
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
 * The metadata cache of `file`, made to match `text` — what its editor shows.
 *
 * The cache is built from the file on disk, which the editor only writes a
 * moment after typing stops. Line numbers from a cache that is one edit behind
 * point at the wrong lines, so when the editor is ahead it is saved first and
 * the cache of that save awaited. `null` when the cache doesn't catch up.
 */
export async function freshCache(
    app: App,
    file: TFile,
    text: string,
): Promise<CachedMetadata | null> {
    if (text === (await app.vault.read(file))) {
        return app.metadataCache.getFileCache(file);
    }
    // Listen before writing, so a fast parse can't slip past.
    const parsed = parsedCache(app, file, text);
    await app.vault.modify(file, text);
    return parsed;
}
