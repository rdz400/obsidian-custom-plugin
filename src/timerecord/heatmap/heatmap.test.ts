import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heatClasses } from './heatmap';

test('heatClasses gives the shared class and a two-digit hour', () => {
    assert.equal(heatClasses(8), 'ronald-time-heat ronald-time-heat-08');
    assert.equal(heatClasses(17), 'ronald-time-heat ronald-time-heat-17');
});
