import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TaskItem } from '../taskitems';
import { Drafts, sameTags } from './draft';
import { type Plan, planChanges, summaryLines } from './plan';
import { notesOf, taskIndex } from './testtasks';

const INBOX = '1-taken/inbox.md';
const TODAY = '1-taken/today.md';
const SOMEDAY = '1-taken/someday.md';

/**
 * Check what a plan does once written: read the notes again, and every task
 * is there once, where and as its draft says (or as it was, in a skipped
 * note); every other line is still there; and planning again finds nothing
 * left to change.
 */
function checkWritten(
    texts: Record<string, string>,
    tasks: readonly TaskItem[],
    drafts: Drafts,
    plan: Plan,
    skip: ReadonlySet<string>,
): void {
    const after = { ...texts };
    for (const change of plan.changes) after[change.path] = change.text;
    const again = notesOf(after);
    assert.equal(again.tasks.length, tasks.length, 'no task lost or doubled');

    const found = new Set<number>();
    tasks.forEach((task, i) => {
        const skipped = skip.has(task.file.path);
        const place = plan.places[i]!;
        const want = skipped ? drafts.base(i) : drafts.draft(i);
        assert.equal(place.path, skipped ? task.file.path : drafts.destination(i), `where "${task.text}" is`);
        const k = again.tasks.findIndex((t, j) => !found.has(j) && t.file.path === place.path && t.raw === place.raw);
        assert.notEqual(k, -1, `"${task.text}" found again`);
        found.add(k);
        assert.ok(sameTags(again.tasks[k]!.ownTags, want.ownTags), `tags of "${task.text}"`);
        assert.equal(again.tasks[k]!.done, want.done, `checkbox of "${task.text}"`);
    });

    const others = (notes: Record<string, string>) =>
        Object.values(notes)
            .flatMap((text) => text.split('\n'))
            .filter((line) => line.trim() !== '' && !/^\s*[-*+] /.test(line))
            .sort();
    assert.deepEqual(others(after), others(texts), 'other lines kept');

    const fresh = new Drafts(again.tasks, again.targets);
    const notes = again.notes.map(({ file, text, lines }) => ({ path: file.path, text, lines }));
    assert.deepEqual(planChanges(notes, again.tasks, fresh).changes, [], 'nothing left to change');
}

function session(texts: Record<string, string>) {
    const { notes, tasks, targets } = notesOf(texts);
    const drafts = new Drafts(tasks, targets);
    const at = (text: string) => taskIndex(tasks, text);
    const planNotes = notes.map(({ file, text, lines }) => ({ path: file.path, text, lines }));
    // Every plan made in a test is checked once written too.
    const plan = (skip = new Set<string>()) => {
        const result = planChanges(planNotes, tasks, drafts, skip);
        checkWritten(texts, tasks, drafts, result, skip);
        return result;
    };
    const textOf = (result: ReturnType<typeof plan>, path: string) =>
        result.changes.find((change) => change.path === path)?.text;
    return { tasks, drafts, at, plan, textOf };
}

const inbox = [
    '# Inbox',
    '',
    '- [ ] Ouder #prio',
    '\t- [ ] Kind',
    '\t\t- [ ] Kleinkind',
    '\t- [ ] Kind twee',
    '- [ ] Los ^blok',
    '',
    'Tekst eronder',
].join('\n');

const today = ['# Vandaag', '', '- [ ] Al hier', ''].join('\n');

test('tag, finish and move the same task', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.setTag([at('Los ^blok')], 'week', true);
    drafts.setDone([at('Los ^blok')], true);
    drafts.move([at('Los ^blok')], 'today');

    const result = plan();
    assert.equal(textOf(result, TODAY), ['# Vandaag', '', '- [ ] Al hier', '- [x] Los #week ^blok', ''].join('\n'));
    assert.equal(
        textOf(result, INBOX),
        ['# Inbox', '', '- [ ] Ouder #prio', '\t- [ ] Kind', '\t\t- [ ] Kleinkind', '\t- [ ] Kind twee', '', 'Tekst eronder'].join('\n'),
    );
    assert.deepEqual(result.places[at('Los ^blok')], { path: TODAY, raw: '- [x] Los #week ^blok' });
    assert.deepEqual(summaryLines(result.summary, (path) => path.slice(8, -3)), [
        'Applied: 1 moved to today, 1 tagged, 1 finished',
    ]);
});

test('the receiving note is written first', () => {
    const { drafts, at, plan } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.move([at('Los ^blok')], 'today');
    assert.deepEqual(plan().changes.map((change) => [change.path, change.edited]), [
        [TODAY, false],
        [INBOX, true],
    ]);
});

test('a parent moved with its child takes the subtree once', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.move([at('Ouder'), at('Kind')], 'today');
    const result = plan();
    assert.equal(
        textOf(result, TODAY),
        ['# Vandaag', '', '- [ ] Al hier', '- [ ] Ouder #prio', '\t- [ ] Kind', '\t\t- [ ] Kleinkind', '\t- [ ] Kind twee', ''].join('\n'),
    );
    assert.equal(textOf(result, INBOX), ['# Inbox', '', '- [ ] Los ^blok', '', 'Tekst eronder'].join('\n'));
    assert.equal(result.summary.moved.get(TODAY), 4);
});

test('a child moved without its parent is outdented, its subtree along', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.move([at('Kind')], 'today');
    const result = plan();
    assert.equal(
        textOf(result, TODAY),
        ['# Vandaag', '', '- [ ] Al hier', '- [ ] Kind', '\t- [ ] Kleinkind', ''].join('\n'),
    );
    assert.deepEqual(result.places[at('Kleinkind')], { path: TODAY, raw: '\t- [ ] Kleinkind' });
});

test('a child moved elsewhere than its parent lands in its own note', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today, [SOMEDAY]: '' });
    drafts.move([at('Ouder')], 'today');
    drafts.move([at('Kind')], 'someday');
    const result = plan();
    assert.equal(
        textOf(result, TODAY),
        ['# Vandaag', '', '- [ ] Al hier', '- [ ] Ouder #prio', '\t- [ ] Kind twee', ''].join('\n'),
    );
    assert.equal(textOf(result, SOMEDAY), ['- [ ] Kind', '\t- [ ] Kleinkind', ''].join('\n'));
});

test('a note that is both source and target gets one text with both', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.move([at('Al hier')], 'inbox');
    drafts.move([at('Ouder')], 'today');
    drafts.move([at('Kind')], 'inbox');
    const result = plan();
    assert.equal(
        textOf(result, INBOX),
        ['# Inbox', '', '- [ ] Los ^blok', '', 'Tekst eronder', '- [ ] Kind', '\t- [ ] Kleinkind', '- [ ] Al hier', ''].join('\n'),
    );
    const change = result.changes.find((c) => c.path === INBOX)!;
    assert.equal(change.edited, true);
    assert.equal(change.appended, ['- [ ] Kind', '\t- [ ] Kleinkind', '- [ ] Al hier'].join('\n'));
    assert.deepEqual(summaryLines(result.summary, (path) => path.slice(8, -3)), [
        'Applied: 3 moved to inbox, 2 moved to today',
    ]);
});

test("a changed note's own changes are dropped, moves into it still go", () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox, [TODAY]: today });
    drafts.move([at('Al hier')], 'inbox');
    drafts.setTag([at('Ouder')], 'week', true);
    drafts.move([at('Los ^blok')], 'today');
    const result = plan(new Set([INBOX]));
    assert.equal(textOf(result, INBOX), inbox + '\n- [ ] Al hier\n');
    assert.equal(result.changes.find((c) => c.path === INBOX)!.edited, false);
    // The blank lines around "Al hier" close up into one.
    assert.equal(textOf(result, TODAY), ['# Vandaag', ''].join('\n'));
    assert.deepEqual(result.places[at('Los ^blok')], { path: INBOX, raw: '- [ ] Los ^blok' });
    assert.deepEqual(summaryLines(result.summary, (path) => path.slice(8, -3)), [
        'Applied: 1 moved to inbox',
        'Skipped 2 changes in inbox: the note changed since opening',
    ]);
});

test('a target without a note counts as empty', () => {
    const { notes, tasks, targets } = notesOf({ [INBOX]: inbox, [TODAY]: '' });
    const drafts = new Drafts(tasks, targets);
    drafts.move([taskIndex(tasks, 'Los ^blok')], 'today');
    const inboxOnly = notes
        .filter(({ file }) => file.path === INBOX)
        .map(({ file, text, lines }) => ({ path: file.path, text, lines }));
    const result = planChanges(inboxOnly, tasks, drafts);
    assert.equal(result.changes.find((c) => c.path === TODAY)?.text, '- [ ] Los ^blok\n');
});

test('tags come off and on, the rest of the line kept', () => {
    const { drafts, at, plan, textOf } = session({ [INBOX]: inbox });
    drafts.setTag([at('Ouder')], 'prio', false);
    drafts.setTag([at('Ouder'), at('Los ^blok')], 'week', true);
    drafts.setDone([at('Kind')], true);
    const result = plan();
    assert.equal(
        textOf(result, INBOX),
        ['# Inbox', '', '- [ ] Ouder #week', '\t- [x] Kind', '\t\t- [ ] Kleinkind', '\t- [ ] Kind twee', '- [ ] Los #week ^blok', '', 'Tekst eronder'].join('\n'),
    );
    assert.deepEqual(summaryLines(result.summary, String), ['Applied: 2 tagged, 1 finished']);
});

test('nothing changed, nothing planned', () => {
    const { drafts, at, plan } = session({ [INBOX]: inbox });
    drafts.setTag([at('Los ^blok')], 'week', true);
    drafts.setTag([at('Los ^blok')], 'week', false);
    const result = plan();
    assert.deepEqual(result.changes, []);
    assert.deepEqual(summaryLines(result.summary, String), []);
});
