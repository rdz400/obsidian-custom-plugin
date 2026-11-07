import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calendarDay } from './calendar';
import type { WrittenDay } from './parsedays';
import { latestDay, placeDays, placementLabel, placementWords } from './placedays';

const nov = (day: number) => calendarDay(2026, 11, day)!;
const dated = (day: number): WrittenDay => ({ date: nov(day), records: [] });
const undated: WrittenDay = { date: null, records: [] };

const placementsOf = (days: WrittenDay[]) => placeDays(days).map((day) => day.placement);

test('a day with a date keeps it', () => {
    assert.deepEqual(placementsOf([dated(4)]), [{ kind: 'written', day: nov(4) }]);
});

test('one undated day in a one-day gap has that date', () => {
    assert.deepEqual(placementsOf([dated(4), undated, dated(6)])[1], { kind: 'inferred', day: nov(5) });
});

test('undated days that exactly fill a gap get its dates in order', () => {
    assert.deepEqual(placementsOf([dated(4), undated, undated, dated(7)]).slice(1, 3), [
        { kind: 'inferred', day: nov(5) },
        { kind: 'inferred', day: nov(6) },
    ]);
});

test('undated days in a wider gap only say what they lie between', () => {
    assert.deepEqual(placementsOf([dated(4), undated, dated(7)])[1], {
        kind: 'between',
        after: nov(4),
        before: nov(7),
        nth: 1,
        of: 1,
    });
});

test('undated days in a row are numbered in the order of the note', () => {
    assert.deepEqual(placementsOf([undated, undated, dated(4)]).slice(0, 2), [
        { kind: 'between', after: null, before: nov(4), nth: 1, of: 2 },
        { kind: 'between', after: null, before: nov(4), nth: 2, of: 2 },
    ]);
});

test('each run of undated days is numbered on its own', () => {
    const placements = placementsOf([undated, dated(4), undated, undated, dated(10)]);
    assert.deepEqual(placements[0], { kind: 'between', after: null, before: nov(4), nth: 1, of: 1 });
    assert.deepEqual(placements[3], { kind: 'between', after: nov(4), before: nov(10), nth: 2, of: 2 });
});

test('too many undated days for the gap are not given dates', () => {
    assert.equal(placementsOf([dated(4), undated, undated, dated(6)])[1]!.kind, 'between');
});

test('undated days before the first or after the last date have one bound', () => {
    assert.deepEqual(placementsOf([undated, dated(4)])[0], {
        kind: 'between',
        after: null,
        before: nov(4),
        nth: 1,
        of: 1,
    });
    assert.deepEqual(placementsOf([dated(4), undated])[1], {
        kind: 'between',
        after: nov(4),
        before: null,
        nth: 1,
        of: 1,
    });
});

test('a note without dates, or with dates out of order, says nothing', () => {
    const unknown = { kind: 'between', after: null, before: null, nth: 1, of: 1 };
    assert.deepEqual(placementsOf([undated]), [unknown]);
    assert.deepEqual(placementsOf([dated(6), undated, dated(4)])[1], unknown);
});

test('latestDay finds the latest date, inferred ones included', () => {
    assert.equal(latestDay(placeDays([dated(4), dated(6), undated])), nov(6));
    assert.equal(latestDay(placeDays([undated])), null);
});

test('placementLabel says as much as is known', () => {
    const label = (days: WrittenDay[], index: number) => placementLabel(placementsOf(days)[index]!);
    assert.equal(label([dated(4)], 0), 'woensdag 4 november 2026');
    assert.equal(label([dated(4), undated, dated(6)], 1), '~ donderdag 5 november 2026');
    assert.equal(label([dated(4), undated, dated(7)], 1), 'tussen 4 november 2026 en 7 november 2026');
    assert.equal(label([undated, dated(4)], 0), 'vóór 4 november 2026');
    assert.equal(label([dated(4), undated], 1), 'na 4 november 2026');
    assert.equal(label([undated], 0), 'datum onbekend');
});

test('placementLabel tells undated days in a row apart', () => {
    const labels = (days: WrittenDay[]) => placementsOf(days).map((placement) => placementLabel(placement));
    assert.deepEqual(labels([undated, undated, dated(4)]).slice(0, 2), [
        'vóór 4 november 2026 (dag 1 van 2)',
        'vóór 4 november 2026 (dag 2 van 2)',
    ]);
    assert.equal(labels([dated(4), undated, undated, dated(10)])[2], 'tussen 4 november 2026 en 10 november 2026 (dag 2 van 2)');
    assert.equal(labels([dated(4), undated, undated])[1], 'na 4 november 2026 (dag 1 van 2)');
    assert.deepEqual(labels([undated, undated]), ['datum onbekend (dag 1 van 2)', 'datum onbekend (dag 2 van 2)']);
});

test('placementWords is empty without a date, so no weekday is claimed', () => {
    assert.ok(placementWords({ kind: 'written', day: nov(4) }).includes('woensdag'));
    assert.ok(placementWords({ kind: 'inferred', day: nov(5) }).includes('donderdag'));
    assert.deepEqual(placementWords({ kind: 'between', after: nov(4), before: null, nth: 1, of: 1 }), []);
});
