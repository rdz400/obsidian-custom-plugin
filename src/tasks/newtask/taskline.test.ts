import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findEstimate } from '../estimate/estimate';
import { parseEstimate, parseTags, taskLine } from './taskline';

test('taskLine is a bare task for text alone', () => {
    assert.equal(taskLine({ text: '  Bel Jan ', tags: [] }), '- [ ] Bel Jan');
});

test('taskLine puts the link, then the estimate, then the tags', () => {
    const line = taskLine({
        text: 'Bel Jan',
        tags: ['prio', 'thuis'],
        projectLink: '[[tuin]]',
        estimate: 20,
    });
    assert.equal(line, '- [ ] Bel Jan [[tuin]] \\20 #prio #thuis');
});

test('taskLine writes an estimate that counts as one', () => {
    const line = taskLine({ text: 'Bel #jan', tags: ['prio'], estimate: 15 });
    assert.equal(line, '- [ ] Bel #jan \\15 #prio');
    assert.equal(findEstimate(line)?.minutes, 15);
});

test('taskLine leaves out tags the text has and tags given twice', () => {
    const line = taskLine({ text: 'Bel Jan #Prio', tags: ['prio', 'thuis', 'thuis'] });
    assert.equal(line, '- [ ] Bel Jan #Prio #thuis');
});

test('taskLine keeps the estimate typed in the text', () => {
    assert.equal(taskLine({ text: 'Bel Jan \\10', tags: [], estimate: 20 }), '- [ ] Bel Jan \\10');
});

test('parseTags splits on spaces and commas, drops # and folds case', () => {
    assert.deepEqual(parseTags(' #Werk, computer  #werk,,'), ['werk', 'computer']);
    assert.deepEqual(parseTags(''), []);
});

test('parseEstimate reads whole minutes, with or without a backslash', () => {
    assert.equal(parseEstimate(''), undefined);
    assert.equal(parseEstimate(' 20 '), 20);
    assert.equal(parseEstimate('\\45'), 45);
    assert.equal(parseEstimate('0'), null);
    assert.equal(parseEstimate('1.5'), null);
    assert.equal(parseEstimate('tien'), null);
});
