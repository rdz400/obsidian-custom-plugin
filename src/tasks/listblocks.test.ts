import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheOf } from '../shared/testcache';
import { cacheSpans, listItemLines, outdent, withoutLines } from './listblocks';

const note = [
    '# Taken', //            0
    '- [ ] Een', //          1
    '', //                   2
    '\t- [ ] Een sub', //    3
    '\t  en verder', //      4
    '\t\t- [ ] Een subsub', // 5
    '- [ ] Twee', //         6
    '\t- [ ] Twee sub', //   7
    'Tekst', //              8
].join('\n');

const spans = cacheSpans(cacheOf(note).listItems);

test('cacheSpans gives a top-level item no parent', () => {
    assert.deepEqual(spans.slice(0, 2), [
        { start: 1, end: 1, parent: undefined },
        { start: 3, end: 4, parent: 1 },
    ]);
});

test('listItemLines takes an item with its subtree, blank lines left out', () => {
    const { lines, roots } = listItemLines(spans, 1, 1);
    assert.deepEqual([...lines], [1, 3, 4, 5]);
    assert.deepEqual([...roots], [1]);
});

test('listItemLines takes a subtask without its parent', () => {
    const { lines, roots } = listItemLines(spans, 4, 4);
    assert.deepEqual([...lines], [3, 4, 5]);
    assert.deepEqual([...roots], [3]);
});

test('listItemLines makes a root of every item touched whose parent is not', () => {
    const { lines, roots } = listItemLines(spans, 5, 7);
    assert.deepEqual([...lines], [5, 6, 7]);
    assert.deepEqual([...roots], [5, 6]);
});

test('listItemLines takes nothing outside list items', () => {
    assert.equal(listItemLines(spans, 0, 0).lines.size, 0);
    assert.equal(listItemLines(spans, 8, 8).lines.size, 0);
});

test('outdent brings each root to the left, its subtree along', () => {
    assert.deepEqual(
        outdent(['\t- [ ] Sub', '\t\t- [ ] Subsub', '\t\t\t- [ ] Diep', '- [ ] Top', '\t- [ ] Onder'], new Set([0, 3])),
        ['- [ ] Sub', '\t- [ ] Subsub', '\t\t- [ ] Diep', '- [ ] Top', '\t- [ ] Onder'],
    );
});

test('outdent copes with spaces under a tab-indented root', () => {
    assert.deepEqual(
        outdent(['\t- [ ] Sub', '    - [ ] Subsub', '  - [ ] Kort'], new Set([0])),
        ['- [ ] Sub', '   - [ ] Subsub', ' - [ ] Kort'],
    );
});

test('withoutLines leaves one blank line where a run between two was taken out', () => {
    const lines = ['Kop', '', '- a', '- b', '', 'Tekst'];
    assert.deepEqual(withoutLines(lines, new Set([2, 3])), ['Kop', '', 'Tekst']);
});

test('withoutLines keeps a blank line with text on one side only', () => {
    const lines = ['Kop', '', '- a', 'Tekst'];
    assert.deepEqual(withoutLines(lines, new Set([2])), ['Kop', '', 'Tekst']);
});
