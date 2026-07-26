import {
    ListItemCache,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    MarkdownRenderer,
    Notice,
    Plugin,
    TFile,
} from 'obsidian';

/** Renders ```csv code blocks as an HTML table. */
function processCsvCodeBlock(
    source: string,
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext,
): void {
    const rows = source.split('\n').filter((row) => row.length > 0);

    const table = el.createEl('table');
    const body = table.createEl('tbody');

    for (const row of rows) {
        const cols = row.split(',');
        const tr = body.createEl('tr');
        for (const col of cols) {
            tr.createEl('td', { text: col });
        }
    }
}

/**
 * One list item collected from a note, with the raw source line it came from.
 *
 * Covers both checkbox tasks and regular bullets: `isTask` says which. A bullet
 * has no marker to write back, so it renders without a checkbox.
 */
interface CollectedTask {
    file: TFile;
    /** Line number at collection time. Only a hint: the file may change before a write. */
    line: number;
    /** The full raw source line, used to verify the line hint still points at this task. */
    raw: string;
    /** True when this line is a checkbox ("- [ ] ..."), false for a plain bullet. */
    isTask: boolean;
    /** Nested list items directly below this one, in document order. */
    children: CollectedTask[];
}

/** Set the checkbox marker of a task line, e.g. "- [ ] Foo" -> "- [x] Foo". */
function setTaskMarker(line: string, marker: string): string {
    return line.replace(/^(\s*[-*+]\s+)\[[^\]]\]/, `$1[${marker}]`);
}

/**
 * Locate `task.raw` in `lines` and return its index, or -1 when it can't be
 * pinned down unambiguously.
 *
 * The line number captured at render time goes stale as soon as anything above
 * the task changes (an edit in another pane, a task moved away by another
 * command). Writing to a stale index would silently rewrite an unrelated line,
 * so the hint is only trusted when the text there still matches. Otherwise we
 * fall back to a content search, and give up if the text is absent or appears
 * more than once.
 */
function findTaskLine(lines: string[], task: CollectedTask): number {
    if (lines[task.line] === task.raw) return task.line;

    const matches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === task.raw) matches.push(i);
    }
    return matches.length === 1 ? (matches[0] as number) : -1;
}

/**
 * Parse the comma-separated tags in a ```taken block's body.
 *
 * Everything in the block is treated as one comma-separated list, so newlines
 * are just separators too. A leading "#" is optional and stripped, and tags are
 * lowercased so the comparison against the note's own tags is case-insensitive
 * (Obsidian treats tags that way).
 */
function parseTagFilter(source: string): string[] {
    return source
        .split(/[,\n]/)
        .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
        .filter((tag) => tag.length > 0);
}

/**
 * The tags a task line carries: the inline "#tag"s in its own text plus the
 * tags of the note it lives in, since a note-level tag applies to everything
 * in that note.
 */
function tagsForTask(raw: string, fileTags: string[]): string[] {
    const inline = Array.from(raw.matchAll(/#([\w/-]+)/g)).map((match) =>
        (match[1] as string).toLowerCase(),
    );
    return [...fileTags, ...inline];
}

/**
 * The note-level tags of a file: its frontmatter `tags` only.
 *
 * Deliberately *not* `cache.tags`: that lists every inline tag in the body,
 * which belongs to the individual line it was written on, not to the note. A
 * task note is one long list of differently-tagged tasks, so folding those in
 * would give every task every tag in the note and match any filter.
 */
function collectFileTags(plugin: Plugin, file: TFile): string[] {
    const cache = plugin.app.metadataCache.getFileCache(file);
    const tags: string[] = [];

    // Frontmatter `tags` is a string, a comma/space separated string, or a list
    // depending on how the note was written; normalise all three to a flat list.
    const frontmatterTags = cache?.frontmatter?.tags ?? cache?.frontmatter?.tag;
    const raw = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
    for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        for (const tag of entry.split(/[,\s]+/)) {
            const normalised = tag.trim().replace(/^#/, '').toLowerCase();
            if (normalised.length > 0) tags.push(normalised);
        }
    }

    return tags;
}

/**
 * True when `taskTags` satisfies `filter`.
 *
 * A task matches if it carries any of the filter's tags, and a nested tag
 * counts for its parents ("#work/admin" matches a "work" filter) to mirror how
 * Obsidian's own tag search behaves. An empty filter matches everything.
 */
function matchesTagFilter(taskTags: string[], filter: string[]): boolean {
    if (filter.length === 0) return true;
    return filter.some((wanted) =>
        taskTags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`)),
    );
}

/** Every line in the subtree rooted at `node`, including `node` itself. */
function flattenSubtree(node: CollectedTask): CollectedTask[] {
    return [node, ...node.children.flatMap(flattenSubtree)];
}

/**
 * True when any line in the hierarchy is a checkbox.
 *
 * Used to drop hierarchies made purely of prose bullets: those are notes, not
 * work. A bullet that merely *heads* a list of tasks is kept, because its
 * subtree does contain checkboxes.
 */
function containsTask(root: CollectedTask): boolean {
    return flattenSubtree(root).some((node) => node.isTask);
}

/**
 * Build the task hierarchies of one note: top-level list items, each with its
 * descendants attached, in document order.
 *
 * `listItems` is flat and ordered by position, with `parent` holding the start
 * line of the containing item (negative for a top-level item, where it encodes
 * the section instead). Since a parent always appears before its children, one
 * forward pass indexed by start line is enough to rebuild the tree.
 */
function buildHierarchies(
    items: ListItemCache[],
    lines: string[],
    file: TFile,
): CollectedTask[] {
    const byLine = new Map<number, CollectedTask>();
    const roots: CollectedTask[] = [];

    for (const item of items) {
        const line = item.position.start.line;
        const raw = lines[line];
        if (raw === undefined) continue;

        const node: CollectedTask = {
            file,
            line,
            raw,
            isTask: item.task !== undefined,
            children: [],
        };
        byLine.set(line, node);

        const parent = item.parent < 0 ? undefined : byLine.get(item.parent);
        if (parent) parent.children.push(node);
        else roots.push(node);
    }

    return roots;
}

/**
 * Collect the task hierarchies from the notes directly under `folder`, keeping
 * only those matching `tagFilter` (all of them when the filter is empty).
 *
 * Filtering is per hierarchy, never per line: a tag on any subtask selects the
 * whole hierarchy rooted at its top-level task, which then renders in full.
 * That keeps a matched subtask in the context that gives it meaning, and is why
 * subtasks are never surfaced on their own.
 */
async function collectTasks(
    plugin: Plugin,
    folder: string,
    tagFilter: string[],
): Promise<CollectedTask[]> {
    const app = plugin.app;
    const files = app.vault
        .getMarkdownFiles()
        .filter((file) => file.path.startsWith(`${folder}/`));

    const tasks: CollectedTask[] = [];

    for (const file of files) {
        const items = app.metadataCache.getFileCache(file)?.listItems ?? [];
        if (items.length === 0) continue;

        const lines = (await app.vault.cachedRead(file)).split('\n');
        const fileTags = collectFileTags(plugin, file);

        for (const root of buildHierarchies(items, lines, file)) {
            if (!containsTask(root)) continue;

            const subtree = flattenSubtree(root);

            // The hierarchy's tags are the union of every line's tags, so a tag
            // written on a subtask selects the whole thing.
            const hierarchyTags = subtree.flatMap((node) =>
                tagsForTask(node.raw, fileTags),
            );
            if (!matchesTagFilter(hierarchyTags, tagFilter)) continue;

            tasks.push(root);
        }
    }

    return tasks;
}

/**
 * Write the new checkbox marker for `task` back into its source note.
 *
 * Uses `vault.process` so the read-modify-write is atomic: reading and writing
 * as separate steps would drop concurrent edits made in between.
 */
async function writeTaskMarker(
    plugin: Plugin,
    task: CollectedTask,
    marker: string,
): Promise<boolean> {
    let written = false;

    await plugin.app.vault.process(task.file, (data) => {
        const lines = data.split('\n');
        const index = findTaskLine(lines, task);
        if (index === -1) return data;

        const current = lines[index];
        if (current === undefined) return data;

        lines[index] = setTaskMarker(current, marker);
        written = true;
        return lines.join('\n');
    });

    return written;
}

/**
 * Render one list item, then its children as a nested list.
 *
 * A checkbox line gets a checkbox wired back to its source note; a regular
 * bullet renders as plain text, since there is no marker to toggle.
 */
async function renderTask(
    plugin: Plugin,
    task: CollectedTask,
    list: HTMLElement,
    child: MarkdownRenderChild,
    sourcePath: string,
    state: { writing: boolean },
): Promise<void> {
    const isDone = task.isTask && /^\s*[-*+]\s+\[[xX]\]/.test(task.raw);

    const li = list.createEl('li', {
        cls: task.isTask
            ? ['task-list-item', ...(isDone ? ['is-checked'] : [])]
            : [],
    });
    if (isDone) li.dataset.task = 'x';

    const checkbox = task.isTask
        ? li.createEl('input', {
              type: 'checkbox',
              cls: 'task-list-item-checkbox',
          })
        : undefined;
    if (checkbox) checkbox.checked = isDone;

    // Render the item's text through Obsidian so wikilinks, tags and inline
    // markup behave exactly as they do in the source note. The leading list
    // marker (and checkbox, when present) is stripped: the rendered checkbox
    // above stands in for it.
    const body = li.createSpan();
    const text = task.raw.replace(/^\s*[-*+]\s+(?:\[[^\]]\]\s*)?/, '');
    await MarkdownRenderer.render(plugin.app, text, body, sourcePath, child);

    // MarkdownRenderer wraps single-line content in a <p>; unwrap it so the
    // text sits inline next to the checkbox instead of breaking onto its own line.
    const paragraph = body.querySelector('p');
    if (paragraph && body.childElementCount === 1) {
        paragraph.replaceWith(...Array.from(paragraph.childNodes));
    }

    // Subtasks hang off their parent's <li>, mirroring the source note's nesting.
    if (task.children.length > 0) {
        const sublist = li.createEl('ul', { cls: 'contains-task-list' });
        for (const nested of task.children) {
            await renderTask(plugin, nested, sublist, child, sourcePath, state);
        }
    }

    if (!checkbox) return;

    checkbox.addEventListener('click', async (event) => {
        // Stop the click from also being handled by the surrounding note (the
        // reading view treats clicks on a task line as "open the link").
        event.stopPropagation();

        // The browser has already flipped `checked` by the time a click handler
        // runs, so this is the state the user just asked for.
        const desired = checkbox.checked;
        const marker = desired ? 'x' : ' ';

        // Reflect the intent immediately, then correct it if the write fails.
        // Waiting for a re-render would leave the box visibly unresponsive.
        li.toggleClass('is-checked', desired);
        if (desired) li.dataset.task = 'x';
        else delete li.dataset.task;

        checkbox.disabled = true;
        state.writing = true;
        let ok = false;
        try {
            ok = await writeTaskMarker(plugin, task, marker);
        } finally {
            checkbox.disabled = false;
            // Release the redraw guard only after the metadata change for this
            // write has had a chance to fire, so it is the one we suppress.
            window.setTimeout(() => {
                state.writing = false;
            }, 100);
        }

        if (ok) {
            // Keep the in-memory task in sync so a second click on this same
            // element (before any re-render) still finds its line.
            task.raw = setTaskMarker(task.raw, marker);
        } else {
            // Roll the UI back: the source note no longer matches what we rendered.
            checkbox.checked = !desired;
            li.toggleClass('is-checked', !desired);
            if (!desired) li.dataset.task = 'x';
            else delete li.dataset.task;
            new Notice(
                `Could not update task in "${task.file.basename}": the note changed.`,
            );
        }
    });
}

/** Renders ```taken code blocks as an interactive list of unnested tasks in "1-taken". */
function makeProcessTakenCodeBlock(
    plugin: Plugin,
): (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void> {
    const folder = '1-taken';

    return async (source, el, ctx) => {
        const child = new MarkdownRenderChild(el);
        ctx.addChild(child);

        const tagFilter = parseTagFilter(source);

        // Set while this block is writing a checkbox back to its note, so the
        // resulting metadata change doesn't tear down and rebuild the list the
        // user is currently clicking in. The click handler already updates its
        // own item, so a redraw would only cause flicker.
        const state = { writing: false };

        const draw = async () => {
            const tasks = await collectTasks(plugin, folder, tagFilter);

            el.empty();

            if (tasks.length === 0) {
                const suffix =
                    tagFilter.length === 0
                        ? ''
                        : ` tagged ${tagFilter.map((tag) => `#${tag}`).join(', ')}`;
                el.createEl('p', { text: `No tasks found in ${folder}${suffix}.` });
                return;
            }

            const list = el.createEl('ul', { cls: 'contains-task-list' });
            for (const task of tasks) {
                await renderTask(plugin, task, list, child, ctx.sourcePath, state);
            }
        };

        // Keep the block in sync with the vault. `metadataCache.on('changed')`
        // fires after a note's cache is reparsed, so the listItems we read are
        // current. Registering on the render child ties the listener's lifetime
        // to the block: it is removed when the block is torn down.
        child.registerEvent(
            plugin.app.metadataCache.on('changed', (file) => {
                if (state.writing) return;
                if (file.path.startsWith(`${folder}/`)) void draw();
            }),
        );
        child.registerEvent(
            plugin.app.vault.on('delete', (file) => {
                if (file.path.startsWith(`${folder}/`)) void draw();
            }),
        );

        await draw();
    };
}

/** Registers all Markdown post processors for the plugin. */
export function registerPostProcessors(plugin: Plugin): void {
    plugin.registerMarkdownCodeBlockProcessor('csv', processCsvCodeBlock);
    plugin.registerMarkdownCodeBlockProcessor('taken', makeProcessTakenCodeBlock(plugin));
}
