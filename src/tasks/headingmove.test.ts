import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheOf } from '../shared/testcache';
import { moveUnderHeading } from './headingmove';

const note = [
    '# Taken', //            0
    '', //                   1
    '## Werk', //            2
    '- [ ] Mail', //         3
    '\t- [ ] Bijlage', //    4
    '- [ ] Bellen', //       5
    '', //                   6
    '### Later', //          7
    '- [ ] Ooit', //         8
    '', //                   9
    '## Thuis', //           10
    '- [ ] Afwas', //        11
    '', //                   12
].join('\n');

const move = (text: string, from: number, to: number, heading: number) =>
    moveUnderHeading(text, cacheOf(text), from, to, heading);

test('moveUnderHeading takes a task with its subtasks to the end of the section', () => {
    assert.equal(
        move(note, 3, 3, 10),
        [
            '# Taken',
            '',
            '## Werk',
            '- [ ] Bellen',
            '',
            '### Later',
            '- [ ] Ooit',
            '',
            '## Thuis',
            '- [ ] Afwas',
            '- [ ] Mail',
            '\t- [ ] Bijlage',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading stops a section at a deeper heading', () => {
    assert.equal(
        move(note, 11, 11, 2),
        [
            '# Taken',
            '',
            '## Werk',
            '- [ ] Mail',
            '\t- [ ] Bijlage',
            '- [ ] Bellen',
            '- [ ] Afwas',
            '',
            '### Later',
            '- [ ] Ooit',
            '',
            '## Thuis',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading puts tasks right below a heading with nothing under it', () => {
    assert.equal(
        move(note, 8, 8, 0),
        [
            '# Taken',
            '- [ ] Ooit',
            '',
            '## Werk',
            '- [ ] Mail',
            '\t- [ ] Bijlage',
            '- [ ] Bellen',
            '',
            '### Later',
            '',
            '## Thuis',
            '- [ ] Afwas',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading outdents a subtask moved without its parent', () => {
    assert.equal(
        move(note, 4, 4, 7),
        [
            '# Taken',
            '',
            '## Werk',
            '- [ ] Mail',
            '- [ ] Bellen',
            '',
            '### Later',
            '- [ ] Ooit',
            '- [ ] Bijlage',
            '',
            '## Thuis',
            '- [ ] Afwas',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading moves to the end of its own section', () => {
    assert.equal(
        move(note, 3, 3, 2),
        [
            '# Taken',
            '',
            '## Werk',
            '- [ ] Bellen',
            '- [ ] Mail',
            '\t- [ ] Bijlage',
            '',
            '### Later',
            '- [ ] Ooit',
            '',
            '## Thuis',
            '- [ ] Afwas',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading leaves a task already at the end of its section where it is', () => {
    assert.equal(move(note, 5, 5, 2), note);
});

test('moveUnderHeading moves several tasks and leaves other selected lines', () => {
    assert.equal(
        move(note, 5, 8, 10),
        [
            '# Taken',
            '',
            '## Werk',
            '- [ ] Mail',
            '\t- [ ] Bijlage',
            '',
            '### Later',
            '',
            '## Thuis',
            '- [ ] Afwas',
            '- [ ] Bellen',
            '- [ ] Ooit',
            '',
        ].join('\n'),
    );
});

test('moveUnderHeading moves to the last heading in a note without a final newline', () => {
    const text = ['## Werk', '- [ ] Mail', '## Thuis', '- [ ] Afwas'].join('\n');
    assert.equal(
        move(text, 1, 1, 2),
        ['## Werk', '## Thuis', '- [ ] Afwas', '- [ ] Mail'].join('\n'),
    );
});

test('moveUnderHeading moves nothing when no list item is selected', () => {
    assert.equal(move(note, 0, 1, 10), undefined);
});
