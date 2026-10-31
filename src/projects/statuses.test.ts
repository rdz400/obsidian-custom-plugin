import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    findStatus,
    isOpenStatus,
    isShownByDefault,
    statusRank,
    type ProjectStatus,
} from './statuses';

const STATUSES: ProjectStatus[] = [
    { value: 'actief', icon: 'play', closed: false, hidden: false },
    { value: 'wachten', icon: '', closed: false, hidden: true },
    { value: 'klaar', icon: 'check', closed: true, hidden: false },
    { value: 'geannuleerd', icon: 'x', closed: true, hidden: true },
];

test('findStatus matches the value exactly, and only strings', () => {
    assert.equal(findStatus(STATUSES, 'klaar')?.value, 'klaar');
    assert.equal(findStatus(STATUSES, 'Klaar'), undefined);
    assert.equal(findStatus(STATUSES, ''), undefined);
    assert.equal(findStatus(STATUSES, ['klaar']), undefined);
    assert.equal(findStatus(STATUSES, undefined), undefined);
});

test('isOpenStatus is false for closed statuses only', () => {
    assert.equal(isOpenStatus(STATUSES, 'actief'), true);
    assert.equal(isOpenStatus(STATUSES, 'wachten'), true);
    assert.equal(isOpenStatus(STATUSES, 'klaar'), false);
    assert.equal(isOpenStatus(STATUSES, 'geannuleerd'), false);
    assert.equal(isOpenStatus(STATUSES, 'onbekend'), true);
    assert.equal(isOpenStatus(STATUSES, undefined), true);
});

test('isShownByDefault hides the hidden statuses, closed or not', () => {
    assert.equal(isShownByDefault(STATUSES, 'actief'), true);
    assert.equal(isShownByDefault(STATUSES, 'wachten'), false);
    assert.equal(isShownByDefault(STATUSES, 'klaar'), true);
    assert.equal(isShownByDefault(STATUSES, 'geannuleerd'), false);
    assert.equal(isShownByDefault(STATUSES, 'onbekend'), true);
    assert.equal(isShownByDefault(STATUSES, ''), true);
});

test('statusRank follows the list, unknown and missing statuses last', () => {
    assert.equal(statusRank(STATUSES, 'actief'), 0);
    assert.equal(statusRank(STATUSES, 'geannuleerd'), 3);
    assert.equal(statusRank(STATUSES, 'onbekend'), 4);
    assert.equal(statusRank(STATUSES, ''), 4);
});
