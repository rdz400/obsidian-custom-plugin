import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyEntries, readableText } from './entries';
import { parseDays } from './parsedays';
import { placeDays } from './placedays';

const entriesOf = (note: string) => historyEntries(placeDays(parseDays(note)));

test('the latest record comes first, within a day too', () => {
    const entries = entriesOf('## [[20261104]]\n- `08:00:00` a\n- `09:00:00` b\n## [[20261105]]\n- `10:00:00` c\n');
    assert.deepEqual(entries.map((entry) => entry.record.text), ['c', 'b', 'a']);
});

test('the time to the next record stops at the end of the day', () => {
    const entries = entriesOf('## [[20261104]]\n- `08:00:00` a\n- `09:30:00` b\n## [[20261105]]\n- `10:00:00` c\n');
    const untilNext = new Map(entries.map((entry) => [entry.record.text, entry.untilNext]));
    assert.equal(untilNext.get('a'), 90 * 60);
    assert.equal(untilNext.get('b'), null);
    assert.equal(untilNext.get('c'), null);
});

test('the time to the next record stops at a split nobody marked', () => {
    const entries = entriesOf('- `22:00:00` a\n- `07:00:00` b\n');
    assert.deepEqual(entries.map((entry) => entry.untilNext), [null, null]);
});

test('an explicit end says how long the record took', () => {
    const [entry] = entriesOf('- `09:30:00` Overleg `09:49:33`\n');
    assert.equal(entry!.took, 19 * 60 + 33);
    assert.equal(entry!.untilNext, null);
});

test('readableText shows a link as its display text or target', () => {
    assert.equal(readableText('Overleg met [[jan-jansen]]'), 'Overleg met jan-jansen');
    assert.equal(readableText('Naar [[260901-tuin|de tuin]] en [[a#kop]]'), 'Naar de tuin en a');
    assert.equal(readableText('Geen link'), 'Geen link');
});
