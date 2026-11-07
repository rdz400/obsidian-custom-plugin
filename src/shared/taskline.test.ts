import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDoneMarker, listLines, taskMarker } from './taskline';
import { cacheOf } from './testcache';

/** The list lines of `text`, with the cache built from it. */
function linesOf(text: string) {
    return listLines(cacheOf(text).listItems, text.split('\n'));
}

test('taskMarker reads the checkbox of a task line only', () => {
    assert.equal(taskMarker('- [ ] Bel'), ' ');
    assert.equal(taskMarker('\t* [x] Klaar'), 'x');
    assert.equal(taskMarker('- Gewoon item'), undefined);
    assert.equal(taskMarker('Tekst [ ] met haken'), undefined);
});

test('isDoneMarker is true for x and X only', () => {
    assert.equal(isDoneMarker('x'), true);
    assert.equal(isDoneMarker('X'), true);
    assert.equal(isDoneMarker('-'), false);
    assert.equal(isDoneMarker(' '), false);
});

test('listLines passes tags and links down to subtasks, own ones first', () => {
    const lines = linesOf(['- [[project]] #thuis', '\t- [ ] Taak #prio', '\t\t- [ ] Subtaak [[jan]]'].join('\n'));
    assert.deepEqual(
        lines.map(({ depth, tags, links }) => ({ depth, tags, links })),
        [
            { depth: 1, tags: ['thuis'], links: ['project'] },
            { depth: 2, tags: ['prio', 'thuis'], links: ['project'] },
            { depth: 3, tags: ['prio', 'thuis'], links: ['jan', 'project'] },
        ],
    );
});

test('listLines includes plain bullets, without a marker', () => {
    const lines = linesOf(['- Bullet', '- [x] Klaar'].join('\n'));
    assert.deepEqual(
        lines.map(({ line, marker }) => ({ line, marker })),
        [
            { line: 0, marker: undefined },
            { line: 1, marker: 'x' },
        ],
    );
});

test('listLines keeps siblings apart', () => {
    const lines = linesOf(['- [ ] Een [[a]]', '- [ ] Twee'].join('\n'));
    assert.deepEqual(lines[1]?.links, []);
});

test('listLines gives a link target, not its display text', () => {
    const lines = linesOf('- [ ] Bellen [[260815-website|de website]]');
    assert.deepEqual(lines[0]?.links, ['260815-website']);
});
