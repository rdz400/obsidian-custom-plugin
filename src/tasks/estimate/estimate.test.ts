import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findEstimate, formatMinutes, lineEstimate, openEstimateTotal } from './estimate';

test('findEstimate finds a backslash and minutes as the last word', () => {
    assert.deepEqual(findEstimate('- [ ] Bel Jan \\20'), { from: 14, to: 17, minutes: 20 });
});

test('findEstimate allows tags and a block id after it', () => {
    assert.equal(findEstimate('- [ ] Bel Jan \\20 #thuis #prio ^abc-1')?.minutes, 20);
});

test('findEstimate ignores a backslash and digits elsewhere', () => {
    assert.equal(findEstimate('- [ ] Kopieer C:\\2024 naar schijf'), null);
    assert.equal(findEstimate('- [ ] Bel\\20'), null);
});

test('lineEstimate reads task lines only', () => {
    assert.equal(lineEstimate('- [ ] Taak \\15')?.minutes, 15);
    assert.equal(lineEstimate('- Bullet \\15'), null);
});

test('openEstimateTotal adds up the open tasks, each on its own', () => {
    const text = ['- [ ] Een \\20', '\t- [ ] Sub \\10', '- [x] Klaar \\60', '- [ ] Zonder', '- Bullet \\5'].join('\n');
    assert.deepEqual(openEstimateTotal(text), { minutes: 30, tasks: 2 });
});

test('formatMinutes reads as hours and minutes', () => {
    assert.equal(formatMinutes(20), '20m');
    assert.equal(formatMinutes(120), '2h');
    assert.equal(formatMinutes(95), '1h 35m');
});
