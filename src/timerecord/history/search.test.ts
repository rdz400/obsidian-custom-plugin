import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyEntries } from './entries';
import { parseDays } from './parsedays';
import { placeDays } from './placedays';
import { firstOfEachDay, recordSearch } from './search';

// 4 November 2026 is a Wednesday, the 5th a Thursday.
const NOTE = [
    '- `08:00:00` Voor de eerste datum',
    '---',
    '## [[20261103]]',
    '- `08:00:00` Overleg met [[jan-jansen]]',
    '---',
    '- `09:00:00` Overleg zonder kop',
    '## [[20261105]]',
    '- `10:14:00` Start dag',
    '- `12:00:00` Lunch',
].join('\n');

const entries = historyEntries(placeDays(parseDays(NOTE)));
const search = recordSearch(entries);
const found = (query: string) => search(query).map((entry) => entry.record.text);

test('an empty query finds everything', () => {
    assert.equal(found('').length, entries.length);
    assert.equal(found('   ').length, entries.length);
});

test('a query finds text anywhere, whatever its case', () => {
    assert.deepEqual(found('LUNCH'), ['Lunch']);
    assert.deepEqual(found('art da'), ['Start dag']);
});

test('a query finds the target of a link', () => {
    assert.deepEqual(found('jansen'), ['Overleg met [[jan-jansen]]']);
});

test('a weekday finds its records, in Dutch and in English', () => {
    assert.deepEqual(found('donderdag'), ['Lunch', 'Start dag']);
    assert.deepEqual(found('thursday'), ['Lunch', 'Start dag']);
});

test('a weekday can be cut short', () => {
    assert.deepEqual(found('don'), ['Lunch', 'Start dag']);
    assert.deepEqual(found('thu'), ['Lunch', 'Start dag']);
});

test('the weekday of an inferred date is found too', () => {
    assert.deepEqual(found('woensdag'), ['Overleg zonder kop']);
});

test('a day with no known date has no weekday', () => {
    for (const day of ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']) {
        assert.ok(!found(day).includes('Voor de eerste datum'), day);
    }
});

test('the middle of a weekday finds nothing, so "dag" is not every day', () => {
    assert.deepEqual(found('dag'), ['Start dag']);
});

test('all words must match', () => {
    assert.deepEqual(found('overleg woensdag'), ['Overleg zonder kop']);
    assert.deepEqual(found('overleg dinsdag'), ['Overleg met [[jan-jansen]]']);
    assert.deepEqual(found('lunch dinsdag'), []);
});

test('a date is found by its month, day and year, and in digits', () => {
    assert.deepEqual(found('5 november lunch'), ['Lunch']);
    assert.deepEqual(found('20261105 lunch'), ['Lunch']);
    assert.deepEqual(found('2026-11-05 lunch'), ['Lunch']);
    assert.deepEqual(found('2026 lunch'), ['Lunch']);
});

test('a time is found from its start', () => {
    assert.deepEqual(found('10:14'), ['Start dag']);
    assert.deepEqual(found('14:00'), []);
});

test('firstOfEachDay marks where each day starts in a filtered list', () => {
    const results = search('');
    const firsts = firstOfEachDay(results);
    assert.deepEqual(
        results.filter((entry) => firsts.has(entry)).map((entry) => entry.record.text),
        ['Lunch', 'Overleg zonder kop', 'Overleg met [[jan-jansen]]', 'Voor de eerste datum'],
    );

    const lunch = search('lunch');
    assert.deepEqual([...firstOfEachDay(lunch)], lunch);
});
