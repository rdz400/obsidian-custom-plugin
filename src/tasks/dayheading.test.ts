import assert from 'node:assert/strict';
import { test } from 'node:test';

import { underHeading } from './dayheading';

const heading = '## Uit vandaag [[20261118]]';
const tasks = '- [ ] Bel Jan\n\t- [ ] nummer';

test('underHeading starts an empty note with the heading', () => {
    assert.equal(underHeading('', heading, tasks), `${heading}\n\n${tasks}\n`);
});

test('underHeading puts a blank line before a new heading', () => {
    assert.equal(underHeading('- [ ] Een', heading, tasks), `\n\n${heading}\n\n${tasks}\n`);
    assert.equal(underHeading('- [ ] Een\n', heading, tasks), `\n${heading}\n\n${tasks}\n`);
    assert.equal(underHeading('- [ ] Een\n\n', heading, tasks), `${heading}\n\n${tasks}\n`);
});

test('underHeading adds no second heading when the note ends under it', () => {
    const content = `# Overzicht\n\n${heading} \n\n- [ ] Eerder\n`;
    assert.equal(underHeading(content, heading, tasks), `${tasks}\n`);
    assert.equal(underHeading(content.trimEnd(), heading, tasks), `\n${tasks}\n`);
});

test('underHeading adds the heading when another one came after it', () => {
    const content = `${heading}\n\n- [ ] Eerder\n\n## Later\n\n- [ ] Iets\n`;
    assert.equal(underHeading(content, heading, tasks), `\n${heading}\n\n${tasks}\n`);
});
