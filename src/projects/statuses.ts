/**
 * A project status as configured in the settings, in Dutch like the notes.
 *
 * The order of the list is the order everywhere: the picker of "Set project
 * status in frontmatter", the chips of the project search (Mod+1…Mod+9) and
 * the order the search lists its projects in.
 */
export interface ProjectStatus {
    /** The `status` frontmatter value, such as "actief". */
    value: string;
    /** Lucide icon on the status pill in the project search; empty for none. */
    icon: string;
    /**
     * The project is no longer running: setting the status sets `eind`, and
     * the link pickers leave the project out.
     */
    closed: boolean;
    /** The project search leaves the project out until its chip is on. */
    hidden: boolean;
}

export const DEFAULT_PROJECT_STATUSES: ProjectStatus[] = [
    { value: 'actief', icon: 'play', closed: false, hidden: false },
    { value: 'backlog', icon: 'list', closed: false, hidden: false },
    { value: 'misschien', icon: 'help-circle', closed: false, hidden: false },
    { value: 'wachten', icon: 'clock', closed: false, hidden: false },
    { value: 'klaar', icon: 'check', closed: true, hidden: false },
    { value: 'geannuleerd', icon: 'x', closed: true, hidden: false },
];

/** The configured status for a frontmatter `status` value, if there is one. */
export function findStatus(
    statuses: readonly ProjectStatus[],
    status: unknown,
): ProjectStatus | undefined {
    if (typeof status !== 'string' || status.length === 0) return undefined;
    return statuses.find((s) => s.value === status);
}

/**
 * Whether a frontmatter `status` value leaves the project running; no status,
 * or one that isn't in the settings, does too.
 */
export function isOpenStatus(statuses: readonly ProjectStatus[], status: unknown): boolean {
    return !findStatus(statuses, status)?.closed;
}

/**
 * Whether the project search shows a project with this status while no
 * status chip is on. A status that isn't in the settings has no chip to turn
 * it on with, so it is always shown.
 */
export function isShownByDefault(statuses: readonly ProjectStatus[], status: unknown): boolean {
    return !findStatus(statuses, status)?.hidden;
}

/** Sort rank for a status: its place in the list; unknown or missing ones sort last. */
export function statusRank(statuses: readonly ProjectStatus[], status: unknown): number {
    const found = findStatus(statuses, status);
    return found ? statuses.indexOf(found) : statuses.length;
}
