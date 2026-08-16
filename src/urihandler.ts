import { Plugin } from 'obsidian';

import type { FilterChip } from './filterbar';
import { searchProjects, type ProjectSearchOptions } from './projectsearch';
import { searchTasks } from './tasksearch';

/** The protocol action that opens the task search modal. */
export const TASKS_URI_ACTION = 'ronald-tasks';

/** The protocol action that opens the project search modal. */
export const PROJECTS_URI_ACTION = 'ronald-projects';

/** Parameters read by the task search action. */
interface TasksUriParams extends Record<string, string> {
    /** Text to put in the search field. */
    query: string;
    /** Comma-separated tag values to switch on, e.g. `tags=nu,vandaag`. */
    tags: string;
    /** When `"true"`, include tasks that are already ticked off. */
    done: string;
}

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
 * Split a comma-separated parameter into the values the filter bar uses.
 *
 * A hand-written link is likely to spell a tag the way it reads in a note, so a
 * leading "#" is accepted and capitals are folded away; the chips themselves are
 * lowercase and unprefixed.
 */
function parseValues(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((entry) => entry.trim().replace(/^#/, '').toLowerCase())
        .filter((entry) => entry.length > 0);
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
 * Register `obsidian://ronald-tasks` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the modal exactly as the
 * command does.
 *
 * The chips come from the plugin settings and are read at call time rather than
 * captured, so a tag added in settings is available to the next link without a
 * reload. `registerObsidianProtocolHandler` unregisters on unload, so nothing
 * extra is needed in `onunload`.
 */
export function registerTasksUriHandler(
    plugin: Plugin,
    filterTags: () => readonly FilterChip[],
): void {
    plugin.registerObsidianProtocolHandler(TASKS_URI_ACTION, (params) => {
        const { query, tags, done } = params as Partial<TasksUriParams>;

        void searchTasks(plugin.app, filterTags(), {
            query,
            activeTags: parseValues(tags),
            showDone: done === 'true',
        });
    });
}

/**
 * Register `obsidian://ronald-projects` for the lifetime of the plugin.
 *
 * Every parameter is optional: the bare URI opens the modal exactly as the
 * command does.
 *
 * `options` carries the hooks the command wiring supplies — Shift+Enter handing
 * the project's name to the task search — so a project opened from a link
 * behaves the same as one opened from the command. It is read at call time
 * rather than captured for the same reason the task chips are.
 */
export function registerProjectsUriHandler(
    plugin: Plugin,
    options: () => ProjectSearchOptions,
): void {
    plugin.registerObsidianProtocolHandler(PROJECTS_URI_ACTION, (params) => {
        const { query, status, tasks } = params as Partial<ProjectsUriParams>;

        void searchProjects(plugin.app, {
            ...options(),
            query,
            activeStatuses: parseValues(status),
            activeTaskFilters: parseTaskFilters(tasks),
        });
    });
}
