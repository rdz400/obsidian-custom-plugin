import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RecordLine } from '../recordline';
import { formatDuration, gapSeconds, tookSeconds } from './durations';

const record = (start: number, end: number | null = null): RecordLine => ({
    time: '',
    start,
    end,
    text: '',
    nested: false,
});

test('tookSeconds is the time to the explicit end', () => {
    assert.equal(tookSeconds(record(100, 160)), 60);
    assert.equal(tookSeconds(record(100)), null);
});

test('tookSeconds runs past midnight when the end is earlier than the start', () => {
    assert.equal(tookSeconds(record(86_000, 400)), 800);
});

test('gapSeconds is the time to the next record', () => {
    assert.equal(gapSeconds(record(100), record(160)), 60);
    assert.equal(gapSeconds(record(100), record(100)), 0);
});

test('gapSeconds is null for the last record of a day', () => {
    assert.equal(gapSeconds(record(100), undefined), null);
});

test('gapSeconds is null when the next time falls behind by seconds', () => {
    assert.equal(gapSeconds(record(130), record(120)), null);
});

test('formatDuration shows the seconds', () => {
    assert.equal(formatDuration(45), '45s');
    assert.equal(formatDuration(5 * 60 + 33), '5m33s');
    assert.equal(formatDuration(3600 + 5 * 60 + 33), '1h5m33s');
});

test('formatDuration does not round', () => {
    assert.equal(formatDuration(59 * 60 + 59), '59m59s');
});

test('formatDuration leaves out zero parts at the end', () => {
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(60), '1m');
    assert.equal(formatDuration(65 * 60), '1h5m');
    assert.equal(formatDuration(2 * 3600), '2h');
});

test('formatDuration keeps a zero part in the middle', () => {
    assert.equal(formatDuration(3600 + 33), '1h0m33s');
});
