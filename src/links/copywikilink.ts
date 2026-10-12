import { App, Notice, TFile } from 'obsidian';

/**
 * Copy a wikilink to `file` to the clipboard.
 *
 * Always `[[...]]`, whatever the vault's link format setting, unlike
 * `generateMarkdownLink`. The link text is resolved from the vault root, since
 * where it will be pasted is unknown: the shortest text that is unambiguous.
 */
export async function copyWikilink(app: App, file: TFile): Promise<void> {
    const link = `[[${app.metadataCache.fileToLinktext(file, '')}]]`;
    try {
        await navigator.clipboard.writeText(link);
        new Notice(`Copied ${link}`);
    } catch (error) {
        console.error(error);
        new Notice('Could not copy the link to the clipboard');
    }
}
