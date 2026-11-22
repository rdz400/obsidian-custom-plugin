import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchesDayparts } from './daypartfilter';
import { historyEntries } from './entries';
import { parseDays } from './parsedays';
import { placeDays } from './placedays';

const entries = historyEntries(
    placeDays(parseDays('- `08:00:00` ochtend\n- `11:59:59` net voor\n- `12:00:00` middag\n- `23:00:00` avond\n- `00:30:00` nacht\n')),
);
const found = (...wanted: string[]) =>
    entries
        .filter((entry) => matchesDayparts(entry, new Set(wanted)))
        .map((entry) => entry.record.text)
        .reverse();

test('no part of the day wanted lets everything through', () => {
    assert.equal(found().length, entries.length);
});

test('the day splits at noon', () => {
    assert.deepEqual(found('am'), ['ochtend', 'net voor']);
    assert.deepEqual(found('pm'), ['middag', 'avond', 'nacht']);
});

test('both parts mean either', () => {
    assert.equal(found('am', 'pm').length, entries.length);
});

