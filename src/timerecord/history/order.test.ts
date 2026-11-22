import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRecordLine } from '../recordline';
import { dayTimes } from './order';

/** The records of one day, by their lines. */
const recordsOf = (...lines: string[]) => lines.map((line) => parseRecordLine(line)!);

const outOfOrder = (...lines: string[]) =>
    dayTimes(recordsOf(...lines)).map((time) => time.outOfOrder);

test('records in order are on the clock as written', () => {
    const times = dayTimes(recordsOf('- `08:00:00` a', '- `09:30:00` b'));
    assert.deepEqual(times, [
        { seconds: 8 * 3600, outOfOrder: false },
        { seconds: 9.5 * 3600, outOfOrder: false },
    ]);
});

test('a day runs past midnight, and counts on from there', () => {
    const times = dayTimes(recordsOf('- `08:00:00` a', '- `23:50:00` b', '- `00:30:00` c', '- `01:15:00` d'));
    assert.deepEqual(times.map((time) => time.seconds), [
        8 * 3600,
        23 * 3600 + 50 * 60,
        24 * 3600 + 30 * 60,
        25 * 3600 + 15 * 60,
    ]);
    assert.ok(times.every((time) => !time.outOfOrder));
});

test('past midnight the day may go on until just before its first record', () => {
    assert.deepEqual(outOfOrder('- `08:00:00` a', '- `22:00:00` b', '- `07:00:00` c'), [false, false, false]);
});

test('a time earlier than the one above it, but not before the first, is out of order', () => {
    assert.deepEqual(
        outOfOrder('- `08:00:00` a', '- `10:00:00` b', '- `09:00:00` c', '- `11:00:00` d'),
        [false, false, true, false],
    );
});

test('a day passes midnight only once', () => {
    assert.deepEqual(
        outOfOrder('- `08:00:00` a', '- `23:00:00` b', '- `02:00:00` c', '- `01:00:00` d'),
        [false, false, false, true],
    );
});

test('past midnight a time reaching the first record again is out of order', () => {
    assert.deepEqual(
        outOfOrder('- `08:00:00` a', '- `23:00:00` b', '- `02:00:00` c', '- `08:00:00` d'),
        [false, false, false, true],
    );
});

test('nested records have to be in order too', () => {
    assert.deepEqual(
        outOfOrder(
            '- `08:59:50` pwsh geinstalleerd',
            '    - `09:19:12` gelezen basic pwshs',
            '    - `10:52:22` starten met "about_Parsing" `11:17:58`',
            '- `09:40:40` Pauze',
            '- `09:41:33` Ui snijden',
        ),
        [false, false, false, true, false],
    );
});

test('the clock is compared by the minute, for times without seconds', () => {
    assert.deepEqual(outOfOrder('- `11:05:30` a', '- `11:05` b'), [false, false]);
});

test('a day without records has no times', () => {
    assert.deepEqual(dayTimes([]), []);
});
