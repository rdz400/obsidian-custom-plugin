import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMissing, linksOnLine, tagsOnLine } from './markdown';

test('linksOnLine gives the target of each link', () => {
    assert.deepEqual(linksOnLine('- [ ] Bel [[jan]] over [[260901-tuin]]'), ['jan', '260901-tuin']);
});

test('linksOnLine gives the target, not the display text', () => {
    assert.deepEqual(linksOnLine('[[260815-website|de website]]'), ['260815-website']);
});

test('linksOnLine leaves out the heading or block part', () => {
    assert.deepEqual(linksOnLine('[[note#Kopje]] [[other^abc|tekst]]'), ['note', 'other']);
});

test('linksOnLine keeps a path as written', () => {
    assert.deepEqual(linksOnLine('[[1-projecten/tuin]]'), ['1-projecten/tuin']);
});

test('tagsOnLine gives the tags lower case without #', () => {
    assert.deepEqual(tagsOnLine('- [ ] Bel #Prio #thuis/keuken'), ['prio', 'thuis/keuken']);
});

test('addMissing appends only what is new, keeping the order', () => {
    assert.deepEqual(addMissing(['a', 'b'], ['b', 'c', 'a', 'd']), ['a', 'b', 'c', 'd']);
});
