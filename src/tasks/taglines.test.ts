import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tagsOnLine } from '../shared/markdown';
import { addTag, hasOwnTag, removeTag } from './taglines';

test('hasOwnTag finds the exact tag only', () => {
    assert.equal(hasOwnTag('- [ ] Bel #prio', 'prio'), true);
    assert.equal(hasOwnTag('- [ ] Bel #Prio', 'prio'), true);
    assert.equal(hasOwnTag('- [ ] Bel #prio/x', 'prio'), false);
    assert.equal(hasOwnTag('- [ ] Bel #prio-x #prios', 'prio'), false);
    assert.equal(hasOwnTag('- [ ] Leer C#prio', 'prio'), false);
});

test('hasOwnTag agrees with tagsOnLine', () => {
    for (const line of ['- [ ] Een #prio, #week', '- [ ] #prio/x #thuis', '- [ ] (#prio)']) {
        for (const tag of ['prio', 'prio/x', 'week', 'thuis']) {
            assert.equal(hasOwnTag(line, tag), tagsOnLine(line).includes(tag), `${tag} in ${line}`);
        }
    }
});

test('addTag puts the tag at the end, trailing whitespace trimmed', () => {
    assert.equal(addTag('- [ ] Bel Jan', 'prio'), '- [ ] Bel Jan #prio');
    assert.equal(addTag('- [ ] Bel Jan  ', 'prio'), '- [ ] Bel Jan #prio');
    assert.equal(addTag('- [ ] Bel Jan #week', 'prio'), '- [ ] Bel Jan #week #prio');
});

test('addTag keeps a block id last', () => {
    assert.equal(addTag('- [ ] Bel Jan ^abc-1', 'prio'), '- [ ] Bel Jan #prio ^abc-1');
    assert.equal(addTag('- [ ] Bel Jan #week ^abc ', 'prio'), '- [ ] Bel Jan #week #prio ^abc');
});

test('addTag may follow an estimate', () => {
    assert.equal(addTag('- [ ] Bel Jan \\20', 'prio'), '- [ ] Bel Jan \\20 #prio');
});

test('addTag adds no duplicate', () => {
    assert.equal(addTag('- [ ] Bel #prio Jan', 'prio'), '- [ ] Bel #prio Jan');
    assert.equal(addTag('- [ ] Bel #prio/x', 'prio'), '- [ ] Bel #prio/x #prio');
});

test('removeTag takes out the exact tag only', () => {
    assert.equal(removeTag('- [ ] Bel #prio/x #prio', 'prio'), '- [ ] Bel #prio/x');
    assert.equal(removeTag('- [ ] Bel #prio-x #prios', 'prio'), '- [ ] Bel #prio-x #prios');
    assert.equal(removeTag('- [ ] Bel #Prio', 'prio'), '- [ ] Bel');
});

test('removeTag closes the gap at the start, in the middle and at the end', () => {
    assert.equal(removeTag('#prio Bel Jan', 'prio'), 'Bel Jan');
    assert.equal(removeTag('- [ ] #prio Bel Jan', 'prio'), '- [ ] Bel Jan');
    assert.equal(removeTag('- [ ] Bel #prio Jan', 'prio'), '- [ ] Bel Jan');
    assert.equal(removeTag('- [ ] Bel Jan #prio', 'prio'), '- [ ] Bel Jan');
    assert.equal(removeTag('- [ ] Bel #prio, Jan', 'prio'), '- [ ] Bel, Jan');
});

test('removeTag takes out every occurrence, keeping the other tags in order', () => {
    assert.equal(
        removeTag('- [ ] Bel #week #prio #thuis #prio ^abc', 'prio'),
        '- [ ] Bel #week #thuis ^abc',
    );
});
