import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calendarDay, dayWords, formatDay, formatShortDay, headingDate, isoWeekday } from './calendar';

const oct24 = calendarDay(2026, 10, 24)!;

test('calendarDay refuses dates that do not exist', () => {
    assert.equal(calendarDay(2026, 2, 30), null);
    assert.equal(calendarDay(2026, 13, 1), null);
});

test('calendarDay counts in days, across a month end', () => {
    assert.equal(calendarDay(2026, 11, 1)! - calendarDay(2026, 10, 31)!, 1);
});

test('headingDate reads every way a date gets written', () => {
    assert.equal(headingDate('[[20261024]]'), oct24);
    assert.equal(headingDate('[[20261024|zaterdag]]'), oct24);
    assert.equal(headingDate('2026-10-24'), oct24);
    assert.equal(headingDate('24-10-2026'), oct24);
    assert.equal(headingDate('24 oktober 2026 (zaterdag)'), oct24);
    assert.equal(headingDate('zaterdag 24 okt 2026'), oct24);
    assert.equal(headingDate('24 October 2026'), oct24);
    assert.equal(headingDate('3 mei 2026'), calendarDay(2026, 5, 3));
    assert.equal(headingDate('3 maart 2026'), calendarDay(2026, 3, 3));
});

test('headingDate finds no date in other headings', () => {
    assert.equal(headingDate('Vakantie'), null);
    assert.equal(headingDate('12 dingen 2026'), null);
    assert.equal(headingDate('[[20261345]]'), null);
    assert.equal(headingDate('[[202610241230]]'), null);
});

test('isoWeekday counts from Monday, with Sunday as 7', () => {
    assert.equal(isoWeekday(calendarDay(2026, 11, 2)!), 1);
    assert.equal(isoWeekday(calendarDay(2026, 11, 7)!), 6);
    assert.equal(isoWeekday(calendarDay(2026, 11, 8)!), 7);
});

test('formatDay and formatShortDay write the date in Dutch', () => {
    assert.equal(formatDay(oct24), 'zaterdag 24 oktober 2026');
    assert.equal(formatShortDay(oct24), '24 oktober 2026');
});

test('dayWords names the date in both languages and in digits', () => {
    const words = dayWords(oct24);
    for (const word of ['zaterdag', 'saturday', '24', 'oktober', 'october', '2026', '20261024', '2026-10-24']) {
        assert.ok(words.includes(word), word);
    }
});
