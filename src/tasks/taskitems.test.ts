import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listLines } from '../shared/taskline';
import { cacheOf, testFile } from '../shared/testcache';
import { findTaskLine, noteTaskItems, setTaskMarker, taskText, textParts } from './taskitems';

/** The tasks of `text`, as they would be read from a task note. */
function tasksOf(text: string) {
    const lines = listLines(cacheOf(text).listItems, text.split('\n'));
    return noteTaskItems(testFile('1-taken/huis.md'), { letter: 'h', label: 'huis' }, undefined, lines);
}

test('noteTaskItems collects tasks only, plain bullets passing their tags on', () => {
    const tasks = tasksOf(['- Bullet #thuis', '\t- [ ] Taak #prio', '- [x] Klaar'].join('\n'));
    assert.deepEqual(
        tasks.map(({ line, text, done, depth, ownTags, tags }) => ({ line, text, done, depth, ownTags, tags })),
        [
            { line: 1, text: 'Taak', done: false, depth: 2, ownTags: ['prio'], tags: ['prio', 'thuis'] },
            { line: 2, text: 'Klaar', done: true, depth: 1, ownTags: [], tags: [] },
        ],
    );
});

test('noteTaskItems gives the nearest task above as parent, past plain bullets', () => {
    const tasks = tasksOf(
        ['- [ ] Een', '\t- Bullet', '\t\t- [ ] Sub', '\t- [ ] Sub twee', '- Bullet', '\t- [ ] Los'].join('\n'),
    );
    assert.deepEqual(
        tasks.map(({ line, parent }) => ({ line, parent })),
        [
            { line: 0, parent: undefined },
            { line: 2, parent: 0 },
            { line: 3, parent: 0 },
            { line: 5, parent: undefined },
        ],
    );
});

test('setTaskMarker sets the checkbox only', () => {
    assert.equal(setTaskMarker('\t- [ ] Bel [x]', 'x'), '\t- [x] Bel [x]');
    assert.equal(setTaskMarker('- [x] Bel', ' '), '- [ ] Bel');
    assert.equal(setTaskMarker('- Bel', 'x'), '- Bel');
});

test('taskText strips the marker, checkbox and tags', () => {
    assert.equal(taskText('\t- [ ] Bel  [[Jan]] #prio over #thuis de tuin'), 'Bel [[Jan]] over de tuin');
});

test('textParts keeps links in place, by their display text', () => {
    assert.deepEqual(textParts('Bel [[260901-jan|Jan]] nu'), [
        { text: 'Bel ', link: false },
        { text: '[[Jan]]', link: true },
        { text: ' nu', link: false },
    ]);
});

test('findTaskLine trusts the line number only while the text there matches', () => {
    const task = { line: 1, raw: '- [ ] Bel' };
    assert.equal(findTaskLine(['- [ ] Een', '- [ ] Bel'], task), 1);
    assert.equal(findTaskLine(['Kop', '- [ ] Een', '- [ ] Bel'], task), 2);
    assert.equal(findTaskLine(['- [ ] Bel', 'Kop', '- [ ] Bel'], task), undefined);
    assert.equal(findTaskLine(['- [ ] Een'], task), undefined);
});
