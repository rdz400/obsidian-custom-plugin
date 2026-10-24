/** Project statuses offered by "Set project status in frontmatter", in Dutch. */
export const PROJECT_STATUSES = ['actief', 'klaar', 'backlog', 'misschien', 'geannuleerd'];

/** Statuses that mark a project as no longer running; these set the `eind` date. */
export const CLOSED_PROJECT_STATUSES = ['klaar', 'geannuleerd'];

/** Whether a frontmatter `status` value leaves the project running; no status does too. */
export function isOpenStatus(status: unknown): boolean {
    return typeof status !== 'string' || !CLOSED_PROJECT_STATUSES.includes(status);
}
