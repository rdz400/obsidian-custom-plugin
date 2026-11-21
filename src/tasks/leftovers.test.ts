import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheOf } from '../shared/testcache';
import { takeLeftovers } from './leftovers';

const today = [
    '---',
    'type: taken',
    '---',
    '# Vandaag',
    '',
    '- [ ] Bel Jan #vandaag #prio',
    '\t- [x] nummer opzoeken #vandaag',
    '\t- notitie bij Jan',
    '- [x] Klaar #vandaag',
    '\t- [x] sub',
    '- [-] Afgezegd',
    '',
    '- Werk',
    '\t- [ ] onder bullet',
    '',
    '- [ ] Offerte #vandaag/later \\30',
    '',
    '> - [ ] in callout',
].join('\n');

test('takeLeftovers takes out the open task hierarchies, in note order', () => {
    const { text, taken, moved } = takeLeftovers(today, cacheOf(today), 'vandaag');
    assert.equal(moved, 3);
    assert.equal(
        taken,
        [
            '- [ ] Bel Jan #prio',
            '\t- [x] nummer opzoeken',
            '\t- notitie bij Jan',
            '- [-] Afgezegd',
            '- [ ] Offerte #vandaag/later \\30',
        ].join('\n'),
    );
    assert.equal(
        text,
        [
            '---',
            'type: taken',
            '---',
            '# Vandaag',
            '',
            '- [x] Klaar #vandaag',
            '\t- [x] sub',
            '',
            '- Werk',
            '\t- [ ] onder bullet',
            '',
            '> - [ ] in callout',
        ].join('\n'),
    );
});

test('takeLeftovers keeps the tags without a today tag', () => {
    const { taken } = takeLeftovers(today, cacheOf(today), '');
    assert.equal(taken.startsWith('- [ ] Bel Jan #vandaag #prio\n\t- [x] nummer opzoeken #vandaag'), true);
});

test('takeLeftovers leaves a note with only finished tasks alone', () => {
    const done = '# Vandaag\n\n- [x] Een\n\t- [X] Twee\n- Bullet\n\t- [ ] Drie';
    assert.deepEqual(takeLeftovers(done, cacheOf(done), 'vandaag'), { text: done, taken: '', moved: 0 });
});

test('takeLeftovers moves a finished task with an open subtask', () => {
    const note = '- [x] Een\n\t- [ ] Twee';
    const { text, taken, moved } = takeLeftovers(note, cacheOf(note), 'vandaag');
    assert.equal(moved, 1);
    assert.equal(taken, note);
    assert.equal(text, '');
});
