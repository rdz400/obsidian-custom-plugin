import assert from 'node:assert/strict';
import { test } from 'node:test';

import { testFile } from '../../shared/testcache';
import { findProject } from './findproject';

const tuin = testFile('1-projecten/260901-tuin-opknappen.md');
const tuinhuis = testFile('1-projecten/261101-tuinhuis.md');
const fiets = testFile('1-projecten/261020-fiets-onderhoud.md');
const projects = [tuin, tuinhuis, fiets];

test('findProject finds a project by name or path, ignoring case and brackets', () => {
    assert.equal(findProject(projects, '260901-Tuin-Opknappen'), tuin);
    assert.equal(findProject(projects, '[[261020-fiets-onderhoud]]'), fiets);
    assert.equal(findProject(projects, '1-projecten/261101-tuinhuis'), tuinhuis);
});

test('findProject takes part of a name when only one project has it', () => {
    assert.equal(findProject(projects, 'tuin-opknappen'), tuin);
    assert.equal(findProject(projects, 'fiets'), fiets);
    assert.equal(findProject(projects, 'tuin'), undefined);
    assert.equal(findProject(projects, 'zolder'), undefined);
});
