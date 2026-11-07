import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lineRecordTime, parseRecordLine, timeHour } from './recordline';

test('lineRecordTime finds the time with its backticks', () => {
    assert.deepEqual(lineRecordTime('- `08:30:00` Start dag'), { from: 2, to: 12, hour: 8 });
});

test('lineRecordTime takes the first time only, not an explicit end', () => {
    const line = '- `09:30:00` Overleg, met een einde `09:49:33`';
    const time = lineRecordTime(line)!;
    assert.equal(line.slice(time.from, time.to), '`09:30:00`');
});

test('lineRecordTime reads indented records and times without seconds', () => {
    assert.deepEqual(lineRecordTime('    - `10:14:00` Ingesprongen'), { from: 6, to: 16, hour: 10 });
    assert.deepEqual(lineRecordTime('\t* `7:05` Vroeg'), { from: 3, to: 9, hour: 7 });
});

test('lineRecordTime ignores lines that don\'t open with a time', () => {
    assert.equal(lineRecordTime('- Overleg om `09:30:00`'), null);
    assert.equal(lineRecordTime('`09:30:00` zonder lijst'), null);
    assert.equal(lineRecordTime('- [ ] `09:30:00` taak'), null);
    assert.equal(lineRecordTime('- `25:00:00` geen tijd'), null);
    assert.equal(lineRecordTime('- `09:30:00 extra` meer dan een tijd'), null);
});

test('timeHour reads a time and nothing else', () => {
    assert.equal(timeHour('23:59:59'), 23);
    assert.equal(timeHour('00:00'), 0);
    assert.equal(timeHour('09:30 uur'), null);
});

test('parseRecordLine reads the time and the text', () => {
    assert.deepEqual(parseRecordLine('- `08:30:21` Start dag'), {
        time: '08:30:21',
        start: 8 * 3600 + 30 * 60 + 21,
        end: null,
        text: 'Start dag',
        nested: false,
    });
});

test('parseRecordLine reads an indented line the same way, and marks it nested', () => {
    assert.deepEqual(parseRecordLine('    - `10:52:22` Lezen `11:17:58`'), {
        time: '10:52:22',
        start: 10 * 3600 + 52 * 60 + 22,
        end: 11 * 3600 + 17 * 60 + 58,
        text: 'Lezen',
        nested: true,
    });
});

test('parseRecordLine takes a closing time as the end and out of the text', () => {
    const record = parseRecordLine('- `09:30:00` Overleg `09:49:33`')!;
    assert.equal(record.end, 9 * 3600 + 49 * 60 + 33);
    assert.equal(record.text, 'Overleg');
});

test('parseRecordLine leaves a time in the middle of the text alone', () => {
    const record = parseRecordLine('- `09:30:00` Bel `10:00` terug')!;
    assert.equal(record.end, null);
    assert.equal(record.text, 'Bel `10:00` terug');
});

test('parseRecordLine reads times without seconds and rejects other lines', () => {
    assert.equal(parseRecordLine('- `11:05` Zonder seconden')!.start, 11 * 3600 + 5 * 60);
    assert.equal(parseRecordLine('- [ ] `09:30:00` taak'), null);
});
