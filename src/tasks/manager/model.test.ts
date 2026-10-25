import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Drafts } from './draft';
import {
    allDone,
    allIn,
    endStates,
    type Filters,
    type GtdTarget,
    groupRows,
    matching,
    noteCounts,
    selectableRows,
    tagCounts,
    tagState,
    tallyText,
    visibleTasks,
} from './model';
import { notesOf, taskIndex } from './testtasks';

const INBOX = '1-taken/inbox.md';
const TODAY = '1-taken/today.md';
const GTD: GtdTarget[] = [
    { id: 'today', name: 'today', path: TODAY },
    { id: 'inbox', name: 'inbox', path: INBOX },
];

const NONE: Filters = { tags: new Set(), notes: new Set(), done: false, topLevel: false };

function session() {
    const { notes, tasks, targets } = notesOf({
        '1-taken/zolder.md': '- [ ] Zolder opruimen #thuis',
        '1-taken/boodschappen.md': '- [ ] Melk #buiten',
        [INBOX]: [
            '- [ ] Ouder #prio',
            '\t- Bullet #thuis',
            '\t\t- [ ] Kind',
            '\t\t\t- [ ] Kleinkind #week',
            '\t- [x] Klaar kind',
            '- [ ] Los',
        ].join('\n'),
        [TODAY]: '- [ ] Al hier #prio',
    });
    const drafts = new Drafts(tasks, targets);
    const at = (text: string) => taskIndex(tasks, text);
    const ends = () => endStates(notes, tasks, drafts, GTD);
    const groups = (filters: Filters = NONE, pinned: ReadonlySet<number> = new Set()) =>
        groupRows(ends(), tasks, drafts, visibleTasks(ends(), filters, pinned), GTD);
    const shape = (filters?: Filters, pinned?: ReadonlySet<number>) =>
        groups(filters, pinned).map((group) => [
            `${group.title} · ${group.count}`,
            ...group.rows.map((row) => `${' '.repeat(row.depth - 1)}${row.context ? '(' : ''}${tasks[row.index]!.text}${row.context ? ')' : ''}`),
        ]);
    return { tasks, drafts, at, ends, groups, shape };
}

test('groups come in GTD order, then the other notes by name', () => {
    const { shape } = session();
    assert.deepEqual(shape(), [
        ['today · 1', 'Al hier'],
        ['inbox · 4', 'Ouder', ' Kind', '  Kleinkind', 'Los'],
        ['boodschappen · 1', 'Melk'],
        ['zolder · 1', 'Zolder opruimen'],
    ]);
});

test('a task is indented by its task depth, plain bullets adding none', () => {
    const { ends, at } = session();
    assert.equal(ends()[at('Kind')]!.depth, 2);
    assert.equal(ends()[at('Kleinkind')]!.depth, 3);
});

test('moved tasks follow at the end of their target group, with their subtree', () => {
    const { drafts, at, shape } = session();
    drafts.move([at('Kind')], 'today');
    drafts.move([at('Melk')], 'today');
    assert.deepEqual(shape(), [
        // The inbox comes before boodschappen, being a GTD note.
        ['today · 4', 'Al hier', 'Kind', ' Kleinkind', 'Melk'],
        ['inbox · 2', 'Ouder', 'Los'],
        ['zolder · 1', 'Zolder opruimen'],
    ]);
});

test('an ancestor that doesn’t match shows as a context row', () => {
    const { shape } = session();
    assert.deepEqual(shape({ ...NONE, tags: new Set(['week']) }), [['inbox · 1', '(Ouder)', ' (Kind)', '  Kleinkind']]);
});

test('tags are inherited through plain bullets, and lost by a move', () => {
    const { drafts, at, ends } = session();
    assert.deepEqual(ends()[at('Kleinkind')]!.tags, ['week', 'thuis', 'prio']);
    drafts.setTag([at('Ouder')], 'prio', false);
    assert.deepEqual(ends()[at('Kleinkind')]!.tags, ['week', 'thuis']);
    drafts.move([at('Kind')], 'today');
    assert.deepEqual(ends()[at('Kleinkind')]!.tags, ['week']);
});

test('Done and Top-level look at the end state', () => {
    const { drafts, at, ends } = session();
    const shown = (filters: Filters) => [...matching(ends(), filters)];
    assert.equal(shown(NONE).includes(at('Klaar kind')), false);
    assert.equal(shown({ ...NONE, done: true }).includes(at('Klaar kind')), true);
    drafts.setDone([at('Los')], true);
    assert.equal(shown(NONE).includes(at('Los')), false);

    const topLevel = { ...NONE, topLevel: true };
    assert.equal(shown(topLevel).includes(at('Kind')), false);
    drafts.move([at('Kind')], 'today');
    assert.equal(shown(topLevel).includes(at('Kind')), true);
    assert.equal(shown(topLevel).includes(at('Kleinkind')), false);
});

test('tag chips AND, note chips OR, on where tasks end up', () => {
    const { drafts, at, ends, tasks } = session();
    const texts = (filters: Filters) => [...matching(ends(), filters)].map((i) => tasks[i]!.text);
    assert.deepEqual(texts({ ...NONE, tags: new Set(['prio', 'thuis']) }), ['Kind', 'Kleinkind']);
    assert.deepEqual(texts({ ...NONE, notes: new Set(['today', 'inbox']) }), ['Ouder', 'Kind', 'Kleinkind', 'Los', 'Al hier']);
    drafts.move([at('Melk')], 'today');
    assert.deepEqual(texts({ ...NONE, notes: new Set(['today']) }), ['Melk', 'Al hier']);
});

test('nested tags match their parent tag', () => {
    const { tasks, targets, notes } = notesOf({ [INBOX]: '- [ ] Een #prio/hoog' });
    const ends = endStates(notes, tasks, new Drafts(tasks, targets), GTD);
    assert.equal(matching(ends, { ...NONE, tags: new Set(['prio']) }).size, 1);
});

test('chip counts say what pressing the chip would leave', () => {
    const { ends } = session();
    const filters = { ...NONE, tags: new Set(['prio']) };
    assert.deepEqual(Object.fromEntries(tagCounts(ends(), filters, ['prio', 'thuis', 'week'])), {
        prio: 4,
        thuis: 2,
        week: 1,
    });
    assert.deepEqual(Object.fromEntries(noteCounts(ends(), filters, ['today', 'inbox'])), { today: 1, inbox: 3 });
    assert.deepEqual(Object.fromEntries(noteCounts(ends(), { ...filters, done: true }, ['inbox'])), { inbox: 4 });
});

test('tag buttons are none, some or all over the own tags of the selection', () => {
    const { drafts, at } = session();
    assert.equal(tagState(drafts, [at('Kind'), at('Los')], 'prio'), 'none', 'an inherited tag does not count');
    assert.equal(tagState(drafts, [at('Ouder'), at('Los')], 'prio'), 'some');
    assert.equal(tagState(drafts, [at('Ouder'), at('Al hier')], 'prio'), 'all');
    assert.equal(tagState(drafts, [at('Kleinkind')], 'week'), 'all');
});

test('Finish turns Reopen when all are done; a move button knows where they are', () => {
    const { drafts, at, ends } = session();
    assert.equal(allDone(drafts, [at('Klaar kind')]), true);
    assert.equal(allDone(drafts, [at('Klaar kind'), at('Los')]), false);
    assert.equal(allDone(drafts, []), false);
    assert.equal(allIn(ends(), [at('Los'), at('Ouder')], INBOX), true);
    assert.equal(allIn(ends(), [at('Los'), at('Melk')], INBOX), false);
});

test('the tally counts selectable rows only', () => {
    const { groups } = session();
    const rows = selectableRows(groups({ ...NONE, tags: new Set(['week']) }));
    assert.equal(rows.length, 1);
    assert.equal(tallyText(rows.length, 0, 0), '1 task');
    assert.equal(tallyText(42, 3, 0), '3 of 42 selected');
    assert.equal(tallyText(42, 0, 3), '42 tasks · 3 changed');
});

test('changed tasks stay visible until the next filter change', () => {
    const { drafts, at, ends, groups } = session();
    const filters = { ...NONE, notes: new Set(['inbox']) };
    const pinned = matching(ends(), filters);
    drafts.setDone([at('Los')], true);
    drafts.move([at('Ouder')], 'today');

    const shown = (pins: ReadonlySet<number>) => selectableRows(groups(filters, pins));
    assert.deepEqual(shown(pinned), [at('Ouder'), at('Kind'), at('Kleinkind'), at('Los')]);
    assert.deepEqual(shown(matching(ends(), filters)), []);
});
