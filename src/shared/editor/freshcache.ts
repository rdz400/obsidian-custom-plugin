import { App, CachedMetadata, TFile } from 'obsidian';

import { parsedCache } from '../vault';

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
