import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chipTags, splitTags, withTags } from './recordtags';

const known = new Set(['werk', 'prive']);

test('splitTags takes known tags out, whatever their case, and tidies the spaces', () => {
    assert.deepEqual(splitTags('Overleg #Werk met Jan', known), {
        text: 'Overleg met Jan',
        tags: ['werk'],
    });
});

test('splitTags leaves other tags in the text and lists each known tag once', () => {
    assert.deepEqual(splitTags('Lunch #prive #eten #prive', known), {
        text: 'Lunch #eten',
        tags: ['prive'],
    });
});

test('splitTags keeps a text without tags as it is', () => {
    assert.deepEqual(splitTags('Overleg met [[Jan]]', known), {
        text: 'Overleg met [[Jan]]',
        tags: [],
    });
});

test('withTags puts the tags at the end of the line', () => {
    assert.equal(withTags('Overleg ', ['werk', 'klant']), 'Overleg #werk #klant');
});

test('withTags skips a tag the text has already, and a tag given twice', () => {
    assert.equal(withTags('Overleg #Werk', ['werk', 'klant', 'klant']), 'Overleg #Werk #klant');
});

test('withTags without tags gives the text', () => {
    assert.equal(withTags('Overleg', []), 'Overleg');
});

test('chipTags drops blank and repeated tags, keeping the order', () => {
    assert.deepEqual(chipTags(['werk', '', 'thuis', 'werk']), ['werk', 'thuis']);
});
