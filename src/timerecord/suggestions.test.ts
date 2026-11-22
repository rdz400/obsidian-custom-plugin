import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchPastRecords, pastRecords } from './suggestions';

const known = new Set(['werk']);

test('pastRecords merges records that differ only in case, spacing and known tags', () => {
    const records = pastRecords(['Overleg  met Jan #werk', 'overleg met jan', 'Lunch'], known);
    assert.deepEqual(
        records.map(({ text, tags }) => ({ text, tags })),
        [
            { text: 'Overleg met Jan', tags: ['werk'] },
            { text: 'Lunch', tags: [] },
        ],
    );
});

test('pastRecords keeps the latest spelling and tags', () => {
    const [record] = pastRecords(['Overleg', 'overleg #werk'], known);
    assert.deepEqual({ text: record!.text, tags: record!.tags }, { text: 'Overleg', tags: [] });
});

test('pastRecords ranks frequent records first, recent ones counting more', () => {
    const texts = ['Lunch', 'Overleg', 'Overleg'];
    assert.deepEqual(
        pastRecords(texts, known).map((record) => record.text),
        ['Overleg', 'Lunch'],
    );

    // Done twice, long ago, against once, just now.
    const old = ['Nieuw', ...Array<string>(1000).fill('Tussendoor'), 'Oud', 'Oud'];
    const ranked = pastRecords(old, known).map((record) => record.text);
    assert.ok(ranked.indexOf('Nieuw') < ranked.indexOf('Oud'));
});

test('pastRecords skips records that are only known tags', () => {
    assert.deepEqual(pastRecords(['#werk', ''], known), []);
});

test('pastRecords shows a wikilink as it reads', () => {
    const [record] = pastRecords(['Overleg [[260901-tuin|de tuin]]'], known);
    assert.equal(record!.text, 'Overleg [[260901-tuin|de tuin]]');
    assert.equal(record!.label, 'Overleg de tuin');
});

const records = pastRecords(
    ['Overleg met Jan', 'Overleg team', 'Lunch #werk', 'Lunch', 'Tuin [[260901-tuin|de tuin]]'],
    known,
);

test('matchPastRecords needs each query word to start a word of the record', () => {
    const texts = (query: string) => matchPastRecords(records, query).map((r) => r.text);
    assert.deepEqual(texts('ov'), ['Overleg met Jan', 'Overleg team']);
    assert.deepEqual(texts('ja ov'), ['Overleg met Jan']);
    assert.deepEqual(texts('erleg'), []);
    assert.deepEqual(texts('de tu'), ['Tuin [[260901-tuin|de tuin]]']);
});

test('matchPastRecords offers nothing for an empty query', () => {
    assert.deepEqual(matchPastRecords(records, '  '), []);
});

test('matchPastRecords leaves out what was typed exactly, unless it brings tags', () => {
    assert.deepEqual(matchPastRecords(records, 'overleg team'), []);
    assert.deepEqual(
        matchPastRecords(records, 'lunch').map((r) => r.tags),
        [['werk']],
    );
});

test('matchPastRecords stops at the limit', () => {
    assert.equal(matchPastRecords(records, 'o', 1).length, 1);
});
