import type { Plugin } from 'obsidian';

import { parseValues } from '../shared/uri';
import { searchProjects } from './search';

/** The protocol action that opens the project search modal. */
export const PROJECTS_URI_ACTION = 'ronald-projects';

/** Parameters read by the project search action. */
interface ProjectsUriParams extends Record<string, string> {
    /** Text to put in the search field. */
    query: string;
    /** Comma-separated status chips, e.g. `status=actief,wachten`. */
    status: string;
    /**
     * Which task chip to switch on: `"met"` for projects with open tasks,
     * `"zonder"` for those without. The short words are what a hand-written
     * link is likely to carry; they are mapped to the chip values here.
     */
    tasks: string;
}

/**
 * The task chips a `tasks` parameter asks for.
 *
 * Both the short form ("met", "zonder") and the chip values themselves are
 * accepted, so a link can be written either way; anything else yields no chip
 * and the bar simply stays as it is.
 */
function parseTaskFilters(value: string | undefined): string[] {
    return parseValues(value).flatMap((entry) => {
        if (entry === 'met' || entry === 'met-taken') return ['met-taken'];
        if (entry === 'zonder' || entry === 'zonder-taken') return ['zonder-taken'];
        return [];
    });
}

/**
 * Register `obsidian://ronald-projects` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the modal exactly as the
 * command does.
 *
 * The task folder is read at call time rather than captured, so changing it
 * in settings needs no reload.
 */
export function registerProjectsUriHandler(
    plugin: Plugin,
    taskFolder: () => string,
): void {
    plugin.registerObsidianProtocolHandler(PROJECTS_URI_ACTION, (params) => {
        const { query, status, tasks } = params as Partial<ProjectsUriParams>;

        void searchProjects(plugin.app, taskFolder(), {
            query,
            activeStatuses: parseValues(status),
            activeTaskFilters: parseTaskFilters(tasks),
        });
    });
}
