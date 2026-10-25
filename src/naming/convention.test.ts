import assert from 'node:assert/strict';
import { test } from 'node:test';

import { conventionalName, datePrefix, followsConvention, slugify } from './convention';

const created = new Date(2026, 9, 25);

test('followsConvention wants a date, a hyphen and a lower case slug', () => {
    assert.equal(followsConvention('261025-overleg-met-jan'), true);
    assert.equal(followsConvention('261025-overleg met jan'), false);
    assert.equal(followsConvention('Overleg met Jan'), false);
    assert.equal(followsConvention('261025-'), false);
});

test('datePrefix is YYMMDD', () => {
    assert.equal(datePrefix(new Date(2026, 0, 5)), '260105');
});

test('slugify drops accents and joins words with single hyphens', () => {
    assert.equal(slugify('Café De Zwaan'), 'cafe-de-zwaan');
    assert.equal(slugify('  overleg met jan! '), 'overleg-met-jan');
});

test('conventionalName puts the creation date in front', () => {
    assert.equal(conventionalName('Overleg met Jan', created), '261025-overleg-met-jan');
});

test('conventionalName replaces a date already in front', () => {
    assert.equal(conventionalName('250101-Oude Datum Notitie', created), '261025-oude-datum-notitie');
    assert.equal(conventionalName('2025-01-01 Notitie', created), '261025-notitie');
    assert.equal(conventionalName('25-01-01 Notitie', created), '261025-notitie');
});

test('conventionalName keeps a longer number in front', () => {
    assert.equal(conventionalName('20251230 dag', created), '261025-20251230-dag');
});

test('conventionalName gives nothing for a name without letters or digits', () => {
    assert.equal(conventionalName('!!!', created), null);
    assert.equal(conventionalName('250101', created), null);
});
