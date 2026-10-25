import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Drafts, sameTags } from './draft';
import { notesOf, taskIndex } from './testtasks';

const session = () => {
    const { tasks, targets } = notesOf({
        '1-taken/inbox.md': ['# Inbox', '- [ ] Ouder #prio', '\t- Bullet', '\t\t- [ ] Kind', '\t- [ ] Kind twee', '- [ ] Los'].join('\n'),
        '1-taken/today.md': ['# Vandaag', '- [ ] Al hier'].join('\n'),
        '1-taken/someday.md': '',
    });
    const at = (text: string) => taskIndex(tasks, text);
    return { tasks, drafts: new Drafts(tasks, targets), at };
};

test('sameTags ignores order', () => {
    assert.equal(sameTags(['a', 'b'], ['b', 'a']), true);
    assert.equal(sameTags(['a'], ['a', 'b']), false);
});

test('a draft starts as the note says, unchanged', () => {
    const { drafts, at } = session();
    assert.deepEqual(drafts.draft(at('Ouder')), { ownTags: ['prio'], done: false });
    assert.deepEqual(drafts.changed(), []);
});

test('adding a tag and taking it off again leaves the task unchanged', () => {
    const { drafts, at } = session();
    drafts.setTag([at('Los')], 'week', true);
    assert.deepEqual(drafts.changed(), [at('Los')]);
    drafts.setTag([at('Los')], 'week', false);
    assert.deepEqual(drafts.changed(), []);
});

test('taking a tag off and adding it back is unchanged, whatever the order', () => {
    const { tasks, targets } = notesOf({ '1-taken/huis.md': '- [ ] Een #a #b' });
    const drafts = new Drafts(tasks, targets);
    drafts.setTag([0], 'a', false);
    drafts.setTag([0], 'a', true);
    assert.deepEqual(drafts.draft(0).ownTags, ['b', 'a']);
    assert.equal(drafts.isChanged(0), false);
});

test('a subtask ends up where its parent goes, through a plain bullet', () => {
    const { drafts, at } = session();
    drafts.move([at('Ouder')], 'today');
    assert.equal(drafts.destination(at('Kind')), '1-taken/today.md');
    assert.equal(drafts.destination(at('Kind twee')), '1-taken/today.md');
    assert.equal(drafts.destination(at('Los')), '1-taken/inbox.md');
    assert.equal(drafts.isMoveRoot(at('Ouder')), true);
    assert.equal(drafts.isMoveRoot(at('Kind')), false);
    assert.equal(drafts.moveRoot(at('Kind')), at('Ouder'));
    assert.deepEqual(drafts.changed(), [at('Ouder'), at('Kind'), at('Kind twee')]);
});

test("a subtask's own move overrides its parent's", () => {
    const { drafts, at } = session();
    drafts.move([at('Ouder')], 'today');
    drafts.move([at('Kind')], 'someday');
    assert.equal(drafts.destination(at('Kind')), '1-taken/someday.md');
    assert.equal(drafts.isMoveRoot(at('Kind')), true);
    assert.equal(drafts.depth(at('Kind')), 1);
    assert.equal(drafts.depth(at('Kind twee')), 2);
});

test('a subtask moved back to its own note while the parent leaves is cut out', () => {
    const { drafts, at } = session();
    drafts.move([at('Ouder')], 'today');
    drafts.move([at('Kind')], 'inbox');
    assert.equal(drafts.destination(at('Kind')), '1-taken/inbox.md');
    assert.equal(drafts.isMoveRoot(at('Kind')), true);
    assert.equal(drafts.isChanged(at('Kind')), true);
});

test('moving a parent and its subtask together gives the subtask no move of its own', () => {
    const { drafts, at } = session();
    drafts.move([at('Kind'), at('Ouder')], 'today');
    assert.equal(drafts.draft(at('Kind')).moveTo, undefined);
    drafts.move([at('Ouder')], 'someday');
    assert.equal(drafts.destination(at('Kind')), '1-taken/someday.md');
});

test('moving a task back to its own note drops the move', () => {
    const { drafts, at } = session();
    drafts.move([at('Los')], 'today');
    drafts.move([at('Los')], 'inbox');
    assert.equal(drafts.draft(at('Los')).moveTo, undefined);
    assert.deepEqual(drafts.changed(), []);
});

test('undo steps back one action at a time', () => {
    const { drafts, at } = session();
    drafts.setTag([at('Los'), at('Ouder')], 'week', true);
    drafts.setDone([at('Los')], true);
    drafts.move([at('Los')], 'today');
    assert.equal(drafts.setDone([at('Los')], true), false, 'no change, no step');

    assert.equal(drafts.undo(), true);
    assert.equal(drafts.destination(at('Los')), '1-taken/inbox.md');
    assert.equal(drafts.draft(at('Los')).done, true);
    drafts.undo();
    assert.equal(drafts.draft(at('Los')).done, false);
    drafts.undo();
    assert.deepEqual(drafts.changed(), []);
    assert.equal(drafts.canUndo, false);
    assert.equal(drafts.undo(), false);
});

test('discard drops every change and the history', () => {
    const { drafts, at } = session();
    drafts.setTag([at('Los')], 'week', true);
    drafts.move([at('Ouder')], 'today');
    drafts.discard();
    assert.deepEqual(drafts.changed(), []);
    assert.equal(drafts.canUndo, false);
});
