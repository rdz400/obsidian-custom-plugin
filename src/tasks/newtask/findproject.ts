import type { TFile } from 'obsidian';

/**
 * The project named `name`, by its note's name or path, ignoring case and any
 * brackets of a link typed around it. Failing that, the one project whose
 * name contains `name`, so a link can leave out the date: "tuin-opknappen"
 * finds "260901-tuin-opknappen". Undefined when none or several do.
 */
export function findProject(projects: readonly TFile[], name: string): TFile | undefined {
    const wanted = name.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();
    const exact = projects.find(
        (file) =>
            file.basename.toLowerCase() === wanted ||
            file.path.toLowerCase() === wanted ||
            file.path.toLowerCase() === `${wanted}.md`,
    );
    if (exact) return exact;
    const partial = projects.filter((file) => file.basename.toLowerCase().includes(wanted));
    return partial.length === 1 ? partial[0] : undefined;
}
