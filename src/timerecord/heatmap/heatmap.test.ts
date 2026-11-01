import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heatClasses, lineRecordTime, timeHour } from './heatmap';

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

test('heatClasses gives the shared class and a two-digit hour', () => {
    assert.equal(heatClasses(8), 'ronald-time-heat ronald-time-heat-08');
    assert.equal(heatClasses(17), 'ronald-time-heat ronald-time-heat-17');
});
