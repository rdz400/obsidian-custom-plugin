import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyEntries, readableText, textParts, totalSeconds } from './entries';
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

test('the time to the next record runs past midnight', () => {
    const entries = entriesOf('## [[20261104]]\n- `08:00:00` a\n- `23:50:00` b\n- `00:30:00` c\n');
    assert.deepEqual(entries.map((entry) => entry.untilNext), [null, 40 * 60, (15 * 60 + 50) * 60]);
    assert.equal(entries[0]!.dayTime, 24 * 3600 + 30 * 60);
});

test('a record out of order has no durations, nor a time to it', () => {
    const entries = entriesOf('- `08:00:00` a\n- `10:00:00` b\n- `09:00:00` c `09:10:00`\n- `11:00:00` d\n');
    const byText = new Map(entries.map((entry) => [entry.record.text, entry]));
    assert.equal(byText.get('c')!.outOfOrder, true);
    assert.equal(byText.get('c')!.took, null);
    assert.equal(byText.get('c')!.untilNext, null);
    assert.equal(byText.get('b')!.untilNext, null);
    assert.equal(byText.get('a')!.untilNext, 2 * 3600);
});

test('an entry knows its tags', () => {
    const [entry] = entriesOf('- `09:30:00` Overleg #Werk met #klant/acme\n');
    assert.deepEqual(entry!.tags, ['werk', 'klant/acme']);
});

test('totalSeconds counts an explicit end, else the time to the next record', () => {
    const entries = entriesOf(
        '## [[20261104]]\n- `08:00:00` a\n- `09:00:00` b `09:20:00`\n- `10:00:00` c\n## [[20261105]]\n- `08:00:00` d\n',
    );
    // a: 1h to b; b: 20m by its end; c and d: the last of their day.
    assert.equal(totalSeconds(entries), 80 * 60);
    assert.equal(totalSeconds([]), 0);
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

test('textParts tells the tags from the text around them', () => {
    assert.deepEqual(textParts('Overleg #werk met Jan #klant/acme'), [
        { text: 'Overleg ', tag: false },
        { text: '#werk', tag: true },
        { text: ' met Jan ', tag: false },
        { text: '#klant/acme', tag: true },
    ]);
    assert.deepEqual(textParts('Geen tag'), [{ text: 'Geen tag', tag: false }]);
    assert.deepEqual(textParts('#werk'), [{ text: '#werk', tag: true }]);
});
