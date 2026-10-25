import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Drafts } from './draft';
import { endStates, type Filters, groupRows, matching, selectableRows } from './model';
import { findAgain, Selection } from './selection';
import { notesOf } from './testtasks';

const ROWS = [10, 11, 12, 13, 14];

test('toggle selects and unselects, with focus on the row', () => {
    const selection = new Selection();
    selection.toggle(11);
    selection.toggle(13);
    assert.deepEqual(selection.values(), [11, 13]);
    selection.toggle(11);
    assert.deepEqual(selection.values(), [13]);
    assert.equal(selection.focus, 11);
});

test('a range runs from the anchor, both ways, and can shrink again', () => {
    const selection = new Selection();
    selection.toggle(12);
    selection.extendTo(ROWS, 14);
    assert.deepEqual(selection.values().sort(), [12, 13, 14]);
    selection.extendTo(ROWS, 10);
    assert.deepEqual(selection.values().sort(), [10, 11, 12]);
    assert.equal(selection.focus, 10);
});

test('a range adds to what was selected before the anchor', () => {
    const selection = new Selection();
    selection.toggle(10);
    selection.toggle(13);
    selection.extendTo(ROWS, 14);
    assert.deepEqual(selection.values().sort(), [10, 13, 14]);
});

test('without an anchor a range starts at the focus', () => {
    const selection = new Selection();
    selection.moveFocus(ROWS, 1);
    selection.moveFocus(ROWS, 1);
    selection.extendTo(ROWS, 13);
    assert.deepEqual(selection.values().sort(), [11, 12, 13]);
});

test('the focus stays within the rows', () => {
    const selection = new Selection();
    assert.equal(selection.moveFocus(ROWS, -1), 14, 'up from nothing starts at the end');
    assert.equal(selection.moveFocus(ROWS, 1), 14);
    assert.equal(selection.moveFocus(ROWS, -10), 10);
    assert.equal(selection.moveFocus([], 1), undefined);
});

test('select all, then clear', () => {
    const selection = new Selection();
    selection.selectAll(ROWS);
    assert.equal(selection.size, 5);
    selection.clear();
    assert.equal(selection.size, 0);
});

test('a filter change drops what is no longer shown', () => {
    const selection = new Selection();
    selection.selectAll(ROWS);
    selection.moveFocus(ROWS, -1);
    selection.prune([10, 12]);
    assert.deepEqual(selection.values(), [10, 12]);
    assert.equal(selection.focus, undefined);
});

test('the focus skips context rows', () => {
    const { notes, tasks, targets } = notesOf({
        '1-taken/huis.md': ['- [ ] Ouder', '\t- [ ] Kind #prio', '- [ ] Ander #prio'].join('\n'),
    });
    const drafts = new Drafts(tasks, targets);
    const ends = endStates(notes, tasks, drafts, []);
    const filters: Filters = { tags: new Set(['prio']), notes: new Set(), done: false, topLevel: false };
    const groups = groupRows(ends, tasks, drafts, matching(ends, filters), []);
    assert.equal(groups[0]!.rows[0]!.context, true);

    const rows = selectableRows(groups);
    const selection = new Selection();
    assert.equal(selection.moveFocus(rows, 1), 1);
    assert.equal(selection.moveFocus(rows, 1), 2);
});

test('findAgain matches duplicate lines in order, and drops what is gone', () => {
    const file = (path: string) => ({ path });
    const tasks = [
        { file: file('a.md'), raw: '- [ ] Bel' },
        { file: file('b.md'), raw: '- [ ] Bel' },
        { file: file('b.md'), raw: '- [ ] Bel' },
    ];
    assert.deepEqual(
        findAgain(
            [
                { path: 'b.md', raw: '- [ ] Bel' },
                { path: 'b.md', raw: '- [ ] Bel' },
                { path: 'b.md', raw: '- [ ] Bel' },
                { path: 'a.md', raw: '- [x] Bel' },
            ],
            tasks,
        ),
        [1, 2, undefined, undefined],
    );
});
