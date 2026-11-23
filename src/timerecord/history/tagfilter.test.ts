import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyEntries } from './entries';
import { parseDays } from './parsedays';
import { placeDays } from './placedays';
import { matchesTags, tagChips } from './tagfilter';

const entries = historyEntries(
    placeDays(parseDays('- `08:00:00` a #werk\n- `09:00:00` b #Thuis\n- `10:00:00` c #werk/overleg\n- `11:00:00` d\n')),
);
const found = (...wanted: string[]) =>
    entries
        .filter((entry) => matchesTags(entry, new Set(wanted)))
        .map((entry) => entry.record.text.split(' ')[0])
        .reverse();

test('no tag wanted lets everything through', () => {
    assert.deepEqual(found(), ['a', 'b', 'c', 'd']);
});

test('a tag finds its records, whatever its case, and those of its nested tags', () => {
    assert.deepEqual(found('werk'), ['a', 'c']);
    assert.deepEqual(found('thuis'), ['b']);
    assert.deepEqual(found('werk/overleg'), ['c']);
});

test('a tag does not find a tag that only starts the same', () => {
    assert.deepEqual(found('wer'), []);
});

test('several tags mean any of them', () => {
    assert.deepEqual(found('werk', 'thuis'), ['a', 'b', 'c']);
});

test('tagChips makes a chip per tag, shown with its #', () => {
    assert.deepEqual(tagChips(['werk']), [{ value: 'werk', type: 'tag' }]);
});
