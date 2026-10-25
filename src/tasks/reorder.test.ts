import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheOf } from '../shared/testcache';
import { moveTaggedToTop, takeByDestination, topLevelTaskTags } from './reorder';

const note = [
    '---',
    'type: taken',
    '---',
    '# Taken',
    '',
    '- [ ] Een #week',
    '\t- [ ] Een sub #prio',
    '- [ ] Twee #prio',
    '- Bullet #thuis',
    '- [ ] Drie #prio',
    '\t- [ ] Drie sub',
].join('\n');

test('topLevelTaskTags lists the tags of top-level tasks only', () => {
    assert.deepEqual(topLevelTaskTags(cacheOf(note)), ['prio', 'week']);
});

test('moveTaggedToTop moves tagged tasks with their subtasks above the body', () => {
    const { text, moved } = moveTaggedToTop(note, cacheOf(note), 'prio');
    assert.equal(moved, 2);
    assert.equal(
        text,
        [
            '---',
            'type: taken',
            '---',
            '- [ ] Twee #prio',
            '- [ ] Drie #prio',
            '\t- [ ] Drie sub',
            '---',
            '# Taken',
            '',
            '- [ ] Een #week',
            '\t- [ ] Een sub #prio',
            '- Bullet #thuis',
        ].join('\n'),
    );
});

test('moveTaggedToTop leaves the note alone without a tagged task', () => {
    const { text, moved } = moveTaggedToTop(note, cacheOf(note), 'buiten');
    assert.equal(moved, 0);
    assert.equal(text, note);
});

test('takeByDestination takes out the tasks a tag sends somewhere', () => {
    const destination = (tags: string[]) => (tags.includes('week') ? 'today' : undefined);
    const { text, taken } = takeByDestination(note, cacheOf(note), destination);
    assert.deepEqual([...taken], [['today', { text: '- [ ] Een #week\n\t- [ ] Een sub #prio', moved: 1 }]]);
    assert.equal(text.includes('Een'), false);
    assert.equal(text.includes('- [ ] Twee #prio'), true);
});

test('takeByDestination groups tasks per destination, in note order', () => {
    const { taken } = takeByDestination(note, cacheOf(note), (tags) => tags[0]);
    assert.deepEqual(taken.get('prio'), { text: '- [ ] Twee #prio\n- [ ] Drie #prio\n\t- [ ] Drie sub', moved: 2 });
    assert.equal(taken.has('thuis'), false);
});
