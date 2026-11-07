import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyEntries } from './entries';
import { parseDays } from './parsedays';
import { placeDays } from './placedays';
import { matchesWeekdays, parseWeekdays, WEEKDAY_CHIPS } from './weekdayfilter';

// 2 November 2026 is a Monday, the 4th a Wednesday, so the day between them is
// an inferred Tuesday. The day before the first date has no weekday.
const NOTE = [
    '- `08:00:00` Onbekend',
    '---',
    '## [[20261102]]',
    '- `08:00:00` Maandag',
    '---',
    '- `08:00:00` Dinsdag',
    '## [[20261104]]',
    '- `08:00:00` Woensdag',
].join('\n');

const entries = historyEntries(placeDays(parseDays(NOTE)));
const found = (...wanted: string[]) =>
    entries
        .filter((entry) => matchesWeekdays(entry, new Set(wanted)))
        .map((entry) => entry.record.text);

test('the chips run from Monday to Sunday, numbered by their shortcut', () => {
    assert.deepEqual(WEEKDAY_CHIPS.map((chip) => chip.value), ['1', '2', '3', '4', '5', '6', '7']);
    assert.equal(WEEKDAY_CHIPS[0]!.label, 'ma');
    assert.equal(WEEKDAY_CHIPS[6]!.label, 'zo');
});

test('no weekday wanted lets everything through, dates or not', () => {
    assert.equal(found().length, entries.length);
});

test('a weekday finds the records of that day', () => {
    assert.deepEqual(found('1'), ['Maandag']);
    assert.deepEqual(found('7'), []);
});

test('several weekdays mean any of them', () => {
    assert.deepEqual(found('1', '3'), ['Woensdag', 'Maandag']);
});

test('an inferred date has a weekday', () => {
    assert.deepEqual(found('2'), ['Dinsdag']);
});

test('a day without a known date never matches a weekday', () => {
    assert.ok(!found('1', '2', '3', '4', '5', '6', '7').includes('Onbekend'));
});

test('a link names a day by its chip, or in full in Dutch or English', () => {
    assert.deepEqual(parseWeekdays('ma,donderdag,friday'), ['1', '4', '5']);
});

test('every day has the right chip, Sunday last', () => {
    assert.deepEqual(parseWeekdays('ma,di,wo,do,vr,za,zo'), ['1', '2', '3', '4', '5', '6', '7']);
    assert.deepEqual(
        parseWeekdays('maandag,dinsdag,woensdag,donderdag,vrijdag,zaterdag,zondag'),
        ['1', '2', '3', '4', '5', '6', '7'],
    );
    assert.deepEqual(
        parseWeekdays('monday,tuesday,wednesday,thursday,friday,saturday,sunday'),
        ['1', '2', '3', '4', '5', '6', '7'],
    );
});

test('a day named twice stays one chip, so toggling it leaves it on', () => {
    assert.deepEqual(parseWeekdays('ma,maandag,monday'), ['1']);
});

test('capitals and spaces in a link are fine', () => {
    assert.deepEqual(parseWeekdays(' Maandag , DI '), ['1', '2']);
});

test('an unknown day is dropped, and no parameter means no chips', () => {
    assert.deepEqual(parseWeekdays('ma,morgen,1'), ['1']);
    assert.deepEqual(parseWeekdays(undefined), []);
});
